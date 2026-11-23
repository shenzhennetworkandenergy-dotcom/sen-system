import { createDecipheriv, createHmac } from "node:crypto";

export type EpsMode = "sandbox" | "live";
export type EpsCredentials = {
  mode: EpsMode;
  username: string;
  password: string;
  hashKey: string;
  merchantId: string;
  storeId: string;
};
export type EpsVerification = {
  merchantTransactionId: string;
  epsTransactionId: string | null;
  status: "success" | "failed" | "cancelled" | "pending";
  amount: string;
  financialEntity: string;
};
export type EpsPaymentInput = {
  merchantTransactionId: string;
  customerOrderId: string;
  amount: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    address2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  products: { name: string; quantity: string; price: string }[];
};

export class EpsError extends Error {
  readonly code:
    | "configuration"
    | "unavailable"
    | "rejected"
    | "invalid_response"
    | "amount_mismatch";
  readonly uncertain: boolean;
  constructor(
    code:
      | "configuration"
      | "unavailable"
      | "rejected"
      | "invalid_response"
      | "amount_mismatch",
    uncertain = false,
  ) {
    super(
      code === "configuration"
        ? "Online payment is temporarily unavailable."
        : uncertain
          ? "Payment status is not yet confirmed. Check this payment before trying again."
          : "EPS could not complete this request. Please check the payment status.",
    );
    this.name = "EpsError";
    this.code = code;
    this.uncertain = uncertain;
  }
}

export function epsHash(value: string, key: string) {
  // EPS specifies UTF-8 bytes of the supplied key, not a base64-decoded key.
  return createHmac("sha512", Buffer.from(key, "utf8"))
    .update(value, "utf8")
    .digest("base64");
}

export function bdtAmount(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(text))
    throw new EpsError("amount_mismatch");
  const [whole, fraction = ""] = text.split(".");
  if (/[1-9]/.test(fraction.slice(2))) throw new EpsError("amount_mismatch");
  const hundred = BigInt(100);
  const minor =
    BigInt(whole) * hundred + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  if (minor <= BigInt(0) || minor > BigInt("99999999999999"))
    throw new EpsError("amount_mismatch");
  return `${minor / hundred}.${String(minor % hundred).padStart(2, "0")}`;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EpsError("invalid_response");
  return value as Record<string, unknown>;
}
function field(value: Record<string, unknown>, name: string) {
  const key = Object.keys(value).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  return key ? value[key] : undefined;
}
function safeText(value: unknown, limit = 200) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function hasProviderError(value: Record<string, unknown>) {
  const code = field(value, "ErrorCode");
  return (
    (code !== undefined &&
      code !== null &&
      code !== "" &&
      code !== 0 &&
      code !== "0") ||
    Boolean(safeText(field(value, "ErrorMessage")))
  );
}

export function epsCheckoutUrl(value: unknown, mode: EpsMode) {
  try {
    const url = new URL(String(value));
    const sessions = url.searchParams.getAll("data");
    const hostname =
      mode === "sandbox" ? "sandboxpg.eps.com.bd" : "pg.eps.com.bd";
    if (
      url.protocol !== "https:" ||
      url.hostname !== hostname ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname.toLowerCase() !== "/pg" ||
      sessions.length !== 1 ||
      !sessions[0].trim() ||
      /^(null|undefined)$/i.test(sessions[0].trim())
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new EpsError("invalid_response", true);
  }
}

export function parseEpsVerification(
  value: unknown,
  expectedId: string,
  expectedAmount: string,
): EpsVerification {
  const result = record(value);
  if (hasProviderError(result)) throw new EpsError("rejected");
  const merchantTransactionId = safeText(
    field(result, "MerchantTransactionId"),
  );
  if (!merchantTransactionId || merchantTransactionId !== expectedId)
    throw new EpsError("invalid_response");
  const amount = bdtAmount(field(result, "TotalAmount"));
  if (amount !== bdtAmount(expectedAmount))
    throw new EpsError("amount_mismatch");
  const rawStatus = safeText(field(result, "Status")).toLowerCase();
  const status =
    rawStatus === "success"
      ? "success"
      : ["failed", "fail"].includes(rawStatus)
        ? "failed"
        : ["cancelled", "canceled", "cancel"].includes(rawStatus)
          ? "cancelled"
          : "pending";
  const currency = safeText(field(result, "Currency"));
  if (currency && currency.toUpperCase() !== "BDT")
    throw new EpsError("amount_mismatch");
  return {
    merchantTransactionId,
    amount,
    status,
    epsTransactionId: safeText(field(result, "EpsTransactionId")) || null,
    financialEntity: safeText(field(result, "FinancialEntity"), 80),
  };
}

export class EpsClient {
  private readonly base: string;
  private readonly credentials: EpsCredentials;
  private readonly transport: typeof fetch;
  constructor(credentials: EpsCredentials, transport: typeof fetch = fetch) {
    if (Object.values(credentials).some((value) => !value))
      throw new EpsError("configuration");
    this.base =
      credentials.mode === "sandbox"
        ? "https://sandboxpgapi.eps.com.bd"
        : "https://pgapi.eps.com.bd";
    this.credentials = credentials;
    this.transport = transport;
  }
  private async request(
    path: string,
    hashInput: string,
    token?: string,
    payload?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.transport(`${this.base}${path}`, {
        method: payload === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          "x-hash": epsHash(hashInput, this.credentials.hashKey),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new EpsError("unavailable", Boolean(token && payload));
    }
    if (!response.ok)
      throw new EpsError(
        "rejected",
        Boolean(token && payload && response.status >= 500),
      );
    try {
      const text = await response.text();
      if (text.length > 100_000) throw new Error();
      return record(JSON.parse(text));
    } catch {
      throw new EpsError("invalid_response", Boolean(token && payload));
    }
  }
  async authenticate() {
    const result = await this.request(
      "/v1/Auth/GetToken",
      this.credentials.username,
      undefined,
      {
        userName: this.credentials.username,
        password: this.credentials.password,
      },
    );
    const token = safeText(field(result, "token"), 20_000);
    if (hasProviderError(result) || !token) throw new EpsError("rejected");
    return token;
  }
  async initialize(input: EpsPaymentInput) {
    if (!/^\d{10,30}$/.test(input.merchantTransactionId))
      throw new EpsError("rejected");
    const token = await this.authenticate();
    const c = input.customer;
    const result = await this.request(
      "/v1/EPSEngine/InitializeEPS",
      input.merchantTransactionId,
      token,
      {
        merchantId: this.credentials.merchantId,
        storeId: this.credentials.storeId,
        CustomerOrderId: input.customerOrderId,
        merchantTransactionId: input.merchantTransactionId,
        transactionTypeId: 1,
        deviceTypeId: 1,
        financialEntityId: 0,
        transitionStatusId: 0,
        version: "1",
        totalAmount: Number(bdtAmount(input.amount)),
        successUrl: input.successUrl,
        failUrl: input.failUrl,
        cancelUrl: input.cancelUrl,
        customerName: c.name,
        customerEmail: c.email,
        customerPhone: c.phone,
        customerAddress: c.address,
        customerAddress2: c.address2,
        customerCity: c.city,
        customerState: c.state,
        customerPostcode: c.postcode,
        customerCountry: c.country,
        shipmentName: c.name,
        shipmentAddress: c.address,
        shipmentAddress2: c.address2,
        shipmentCity: c.city,
        shipmentState: c.state,
        shipmentPostcode: c.postcode,
        shipmentCountry: c.country,
        shippingMethod: "YES",
        noOfItem: String(
          input.products.reduce((sum, p) => sum + Number(p.quantity), 0),
        ),
        productName: input.products
          .map((p) => p.name)
          .join(", ")
          .slice(0, 200),
        productProfile: "general",
        productCategory: "SEN products",
        ProductList: input.products.map((p) => ({
          ProductName: p.name.slice(0, 200),
          NoOfItem: p.quantity,
          ProductPrice: p.price,
          ProductProfile: "general",
          ProductCategory: "SEN products",
        })),
      },
    );
    if (hasProviderError(result)) throw new EpsError("rejected");
    const initializationId = safeText(field(result, "TransactionId"));
    if (!initializationId) throw new EpsError("invalid_response", true);
    return {
      initializationId,
      checkoutUrl: epsCheckoutUrl(
        field(result, "RedirectURL"),
        this.credentials.mode,
      ),
    };
  }
  async verify(merchantTransactionId: string, expectedAmount: string) {
    const token = await this.authenticate();
    const result = await this.request(
      `/v1/EPSEngine/CheckMerchantTransactionStatus?merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`,
      merchantTransactionId,
      token,
    );
    return parseEpsVerification(result, merchantTransactionId, expectedAmount);
  }
}

export function decryptEpsIpn(
  data: unknown,
  secret: string,
): { merchantTransactionId: string } {
  try {
    if (typeof data !== "string" || data.length > 20_000) throw new Error();
    const parts = data.split(":");
    if (
      parts.length !== 2 ||
      parts.some((part) => !/^[A-Za-z0-9+/]+={0,2}$/.test(part))
    )
      throw new Error();
    const iv = Buffer.from(parts[0], "base64");
    const key =
      Buffer.byteLength(secret, "utf8") === 32
        ? Buffer.from(secret, "utf8")
        : Buffer.from(secret, "base64");
    if (iv.length !== 16 || key.length !== 32) throw new Error();
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const result = record(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(parts[1], "base64")),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
    const merchantTransactionId = safeText(
      result.merchant_transaction_id ?? field(result, "MerchantTransactionId"),
    );
    if (!/^\d{10,40}$/.test(merchantTransactionId)) throw new Error();
    // CBC payload is only a notification. Authoritative status is fetched from EPS.
    return { merchantTransactionId };
  } catch {
    throw new EpsError("invalid_response");
  }
}
