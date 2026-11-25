import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { WhatsappFailure } from "./cloud.ts";
import type { WhatsappMessage } from "./messages.ts";

type RecordState = { fingerprint: string; state: "pending" | "accepted" | "rejected" | "unknown"; messageId?: string; updatedAt: string };

export async function sendOnce(directory: string, actorId: string, requestId: string, message: WhatsappMessage, send: () => Promise<string>) {
  if (!path.isAbsolute(directory)) throw new Error("WhatsApp outbox requires an absolute path.");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid request ID.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${requestId}.json`);
  const fingerprint = createHash("sha256").update(JSON.stringify({ actorId, message })).digest("hex");
  let handle;
  try { handle = await open(file, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let prior: RecordState;
    try { prior = JSON.parse(await readFile(file, "utf8")); } catch { throw new WhatsappFailure("unknown", "A previous send is still unresolved. Check the business account before sending again."); }
    if (prior.fingerprint !== fingerprint) throw new WhatsappFailure("rejected", "This send request has already been used. Reopen WhatsApp for a new message.");
    if (prior.state === "accepted" && prior.messageId) return prior.messageId;
    throw new WhatsappFailure(prior.state === "rejected" ? "rejected" : "unknown", prior.state === "rejected"
      ? "This request was already rejected. Reopen WhatsApp to correct and send a new message."
      : "This request may already have reached WhatsApp. Check the business account before sending again.");
  }
  const record: RecordState = { fingerprint, state: "pending", updatedAt: new Date().toISOString() };
  // Persist before any outbound request. A crash leaves a blocked request, never an automatic resend.
  try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
  async function finish(state: RecordState) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const output = await open(temporary, "wx", 0o600);
    try { await output.writeFile(JSON.stringify(state)); await output.sync(); } finally { await output.close(); }
    await rename(temporary, file);
  }
  try {
    const messageId = await send();
    await finish({ ...record, state: "accepted", messageId, updatedAt: new Date().toISOString() });
    return messageId;
  } catch (error) {
    const state = error instanceof WhatsappFailure && error.code !== "unknown" ? "rejected" : "unknown";
    await finish({ ...record, state, updatedAt: new Date().toISOString() }).catch(() => { /* Pending still blocks a resend. */ });
    if (error instanceof WhatsappFailure) throw error;
    throw new WhatsappFailure("unknown", "The sending result could not be saved. Check the business account before sending again.");
  }
}
