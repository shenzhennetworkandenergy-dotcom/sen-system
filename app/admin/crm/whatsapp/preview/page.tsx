import { connection } from "next/server";
import Link from "next/link";

import { WhatsappCsvPreviewTable } from "@/components/crm/WhatsappCsvPreviewTable";
import { WhatsappCategorySelector } from "@/components/crm/WhatsappCategorySelector";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { readWhatsappCategories, readWhatsappCategory } from "@/lib/crm/whatsapp-category-store";
import { readWhatsappSheet } from "@/lib/crm/whatsapp-sheet-store";

export const dynamic = "force-dynamic";

export default async function WhatsappCsvPreviewPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.export");
  const categories = await readWhatsappCategories();
  const requested = (await searchParams).category;
  const category = categories.find((item) => item.slug === requested) ?? categories[0];
  const categorySummaries = await Promise.all(categories.map(async (item) => ({
    ...item,
    rowCount: (await readWhatsappCategory(item.slug)).length,
  })));
  const sheet = await readWhatsappSheet(category.slug);

  return <DashboardShell
    admin={profile.role === "admin"}
    employeePermissions={profile.role === "employee" ? permissions : undefined}
    title="WhatsApp/Messenger CRM CSV Preview"
    subtitle="Complete spreadsheet-style preview of the authoritative offline CSV file."
  >
    <WhatsappCategorySelector admin={profile.role === "admin"} categories={categorySummaries} selectedSlug={category.slug} />
    <div className="mb-3 flex flex-wrap gap-2">
      <Link href="/admin/crm/whatsapp" className="rounded-lg border px-3 py-2 font-bold">← WhatsApp customers</Link>
      {sheet.rows.length ? <Link href={`/admin/crm/whatsapp/export?category=${encodeURIComponent(category.slug)}`} className="rounded-lg border px-3 py-2 font-bold">Download CSV</Link> : null}
    </div>
    <WhatsappCsvPreviewTable
      admin={profile.role === "admin"}
      categorySlug={category.slug}
      fileName={category.fileName}
      hasSnapshot={sheet.hasSnapshot}
      key={category.slug}
      metadata={sheet.metadata}
      revision={sheet.revision}
      rows={sheet.rows}
    />
  </DashboardShell>;
}
