import { requirePermission } from "@/lib/auth/permissions";
import { readWhatsappCategories, readWhatsappCategory } from "@/lib/crm/whatsapp-category-store";
import { serializeWhatsappCustomerCsv } from "@/lib/crm/whatsapp-csv";

export async function GET(request: Request) {
  await requirePermission("crm.export");
  const requestedSlug = new URL(request.url).searchParams.get("category") || "networking";
  const category = (await readWhatsappCategories()).find((item) => item.slug === requestedSlug);
  if (!category) return new Response("The selected WhatsApp CRM category does not exist.", { status: 404 });
  const body = serializeWhatsappCustomerCsv(await readWhatsappCategory(category.slug));
  return new Response(body, { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${category.fileName}"`,
    "cache-control": "no-store",
  } });
}
