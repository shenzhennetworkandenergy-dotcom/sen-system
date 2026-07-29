import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function safeCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function GET() {
  await requirePermission("crm.export");
  const { data, error } = await createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .select("inquiry_number,product_query,phone_number,whatsapp,status,consent_to_contact,source_page,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(20_000);
  if (error) {
    return new Response("Unable to export chatbot inquiries.", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
  const rows = [
    ["Inquiry reference","Product request","Phone number","WhatsApp number","Status","Consent","Source page","Created time","Completed time"],
    ...(data ?? []).map((item) => [
      item.inquiry_number,
      item.product_query,
      item.phone_number,
      item.whatsapp,
      item.status,
      item.consent_to_contact ? "Yes" : "No",
      item.source_page,
      item.created_at,
      item.completed_at,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(safeCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="sen-chatbot-inquiries.csv"',
    },
  });
}
