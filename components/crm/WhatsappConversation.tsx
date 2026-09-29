import { parseWhatsappConversation } from "@/lib/crm/whatsapp-records";

export function WhatsappConversation({ history }: { history: string }) {
  const entries = parseWhatsappConversation(history);
  return <ol className="space-y-2">
    {entries.map((entry, index) => <li key={`${entry.at}-${entry.role}-${index}`} className={`max-w-[85%] rounded-xl border p-3 ${entry.role === "S" ? "ml-auto bg-blue-50" : "bg-[var(--muted-surface)]"}`}>
      <div className="mb-1 flex justify-between gap-3 text-xs font-semibold text-[var(--muted-text)]"><span>{entry.role === "C" ? "Customer" : "SEN"}</span><time>{new Date(entry.at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}</time></div>
      <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
    </li>)}
  </ol>;
}
