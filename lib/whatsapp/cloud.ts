import type { WhatsappMessage } from "./messages.ts";
import { normalizeRecipient, supportedTemplates } from "./messages.ts";

export type CloudConfig = {
  token: string;
  phoneId: string;
  businessNumber: string;
  version: string;
  accountId?: string;
};

export class WhatsappFailure extends Error {
  code: "unavailable" | "account" | "template" | "window" | "rejected" | "unknown";
  constructor(code: WhatsappFailure["code"], message: string) { super(message); this.code = code; }
}

function providerFailure(code: number) {
  if (code === 131047) return new WhatsappFailure("window", "The 24-hour reply window is closed. Choose an approved template.");
  if ([190, 10, 200, 131005, 133010].includes(code)) return new WhatsappFailure("account", "The business WhatsApp connection needs attention. Contact your administrator.");
  return new WhatsappFailure("rejected", "WhatsApp did not accept this message. Check the number, template and account before trying again.");
}

export function createCloudClient(config: CloudConfig, send: typeof fetch = fetch) {
  const base = `https://graph.facebook.com/${config.version}`;
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };
  async function get(path: string, fields: string) {
    let response: Response;
    try {
      response = await send(`${base}/${path}?${new URLSearchParams({ fields, limit: "100" })}`, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    } catch { throw new WhatsappFailure("unavailable", "Could not check the WhatsApp connection. No message was sent."); }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new WhatsappFailure("account", "The business WhatsApp connection needs attention. Contact your administrator.");
    return data;
  }
  return {
    async verifySender() {
      const data = await get(config.phoneId, "display_phone_number,is_on_biz_app,platform_type");
      let actual: string;
      try { actual = normalizeRecipient(data.display_phone_number); } catch { throw new WhatsappFailure("account", "The business sender could not be verified. No message was sent."); }
      if (actual !== config.businessNumber) throw new WhatsappFailure("account", "The connected WhatsApp number does not match the company's number. No message was sent.");
      if (data.is_on_biz_app !== true || data.platform_type !== "CLOUD_API") {
        throw new WhatsappFailure("account", "Meta has not confirmed this number can use both the WhatsApp Business app and Cloud API.");
      }
    },
    async templates() {
      if (!config.accountId) return [];
      const data = await get(`${config.accountId}/message_templates`, "name,language,status,components");
      return supportedTemplates(data.data);
    },
    async validateTemplate(message: WhatsappMessage) {
      if (message.kind !== "template") return;
      const templates = await this.templates();
      const template = templates.find((item) => item.name === message.name && item.language === message.language);
      if (!template || template.parameterCount !== message.parameters.length) throw new WhatsappFailure("template", "This template is not available or its fields have changed. Reopen WhatsApp and choose it again.");
    },
    async send(message: WhatsappMessage) {
      const payload = message.kind === "text"
        ? { type: "text", text: { body: message.text, preview_url: false } }
        : { type: "template", template: { name: message.name, language: { code: message.language },
          ...(message.parameters.length ? { components: [{ type: "body", parameters: message.parameters.map((text) => ({ type: "text", text })) }] } : {}) } };
      let response: Response;
      try {
        // Never retry a message POST: a lost response can still mean Meta accepted it.
        response = await send(`${base}/${config.phoneId}/messages`, { method: "POST", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: message.to,
            ...(config.accountId ? { messaging_account_id: config.accountId } : {}), ...payload }) });
      } catch { throw new WhatsappFailure("unknown", "WhatsApp's response was interrupted. Check the business account before sending again; the message may already have been accepted."); }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500 || !data?.error) throw new WhatsappFailure("unknown", "The sending result could not be confirmed. Check the business account before sending again.");
        throw providerFailure(Number(data.error.code));
      }
      const id = data?.messages?.[0]?.id;
      if (typeof id !== "string" || !id.startsWith("wamid.")) throw new WhatsappFailure("unknown", "The sending result could not be confirmed. Check the business account before sending again.");
      return id;
    },
  };
}
