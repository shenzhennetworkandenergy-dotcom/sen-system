import { normalizeRecipient } from "./messages.ts";

export type WhatsappImportedContact = { recipient: string; name: string };

function unescapeVCard(value: string) {
  return value.replace(/\\[nN]/g, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function decodeName(value: string, field: string) {
  let decoded = value;
  if (/(?:^|;)encoding=quoted-printable(?:;|$)/i.test(field)) {
    const bytes = value.replace(/=([a-f\d]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    decoded = new TextDecoder().decode(Uint8Array.from(bytes, (character) => character.charCodeAt(0)));
  }
  return unescapeVCard(decoded).replace(/[\r\n\t]/g, " ").slice(0, 160);
}

export function parseWhatsappVCard(value: string) {
  const cards = value.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").matchAll(/(?:^|\n)BEGIN:VCARD\n([\s\S]*?)\nEND:VCARD(?=\n|$)/gi);
  const byPhone = new Map<string, Set<string>>();
  let skipped = 0;
  for (const card of cards) {
    const lines = card[1].replace(/(ENCODING=QUOTED-PRINTABLE[^\n]*?)=\n/gi, "$1").split("\n");
    let name = "";
    let secondaryName = "";
    const phones: string[] = [];
    for (const line of lines) {
      const split = line.indexOf(":");
      if (split < 1) continue;
      const field = line.slice(0, split);
      const key = field.split(";", 1)[0].split(".").pop()?.toUpperCase();
      const entry = line.slice(split + 1);
      if (key === "FN") name = decodeName(entry, field);
      if (key === "N") secondaryName = decodeName(entry.replace(/(?<!\\);/g, " "), field);
      if (key === "TEL") {
        try {
          phones.push(normalizeRecipient(unescapeVCard(entry).replace(/^tel:/i, "")));
        } catch { skipped++; }
      }
    }
    name ||= secondaryName;
    if (!name || !phones.length) {
      skipped++;
      continue;
    }
    for (const phone of phones) {
      const names = byPhone.get(phone) ?? new Set<string>();
      names.add(name);
      byPhone.set(phone, names);
    }
  }
  const contacts: WhatsappImportedContact[] = [];
  let conflicting = 0;
  for (const [recipient, names] of byPhone) {
    if (names.size === 1) contacts.push({ recipient, name: [...names][0] });
    else conflicting++;
  }
  return { contacts, skipped, conflicting };
}
