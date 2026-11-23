import "server-only";
import { EpsError, type EpsCredentials } from "./eps";

export function getEpsCredentials(testMode: boolean): EpsCredentials {
  const prefix = testMode ? "EPS_SANDBOX" : "EPS_LIVE";
  if (
    process.env.EPS_ENABLED !== "true" ||
    (!testMode && process.env.EPS_LIVE_ENABLED !== "true")
  )
    throw new EpsError("configuration");
  const get = (key: string) => {
    const value = process.env[`${prefix}_${key}`]?.trim();
    if (!value) throw new EpsError("configuration");
    return value;
  };
  return {
    mode: testMode ? "sandbox" : "live",
    username: get("USERNAME"),
    password: get("PASSWORD"),
    hashKey: get("HASH_KEY"),
    merchantId: get("MERCHANT_ID"),
    storeId: get("STORE_ID"),
  };
}

export function epsConfigured(testMode: boolean) {
  try {
    getEpsCredentials(testMode);
    getPaymentOrigin();
    if (
      !testMode &&
      !/^[0-9a-f-]{36}$/i.test(process.env.EPS_RECEIVING_ADMIN_ID ?? "")
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export function getPaymentOrigin() {
  try {
    const url = new URL(process.env.PAYMENT_PUBLIC_ORIGIN ?? "");
    const local = ["127.0.0.1", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    if (!local && !["sen.com.bd", "www.sen.com.bd"].includes(url.hostname))
      throw new Error();
    return url.origin;
  } catch {
    throw new EpsError("configuration");
  }
}

export function epsIpnSecret(testMode: boolean) {
  return (
    process.env[
      testMode ? "EPS_SANDBOX_IPN_KEY" : "EPS_LIVE_IPN_KEY"
    ]?.trim() ?? ""
  );
}
