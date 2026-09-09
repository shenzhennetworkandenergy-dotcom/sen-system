import { NextResponse } from "next/server";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { EMPLOYEE_LOAN_DOCUMENT_BUCKET } from "@/lib/receivables/employee-loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const { id, documentId } = await params;
  const db = createSupabaseAdminClient();
  const { data } = await db.from("receivable_loan_documents").select("storage_path")
    .eq("id", documentId).eq("receivable_account_id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const signed = await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET).createSignedUrl(data.storage_path, 60, { download: true });
  if (signed.error || !signed.data) return NextResponse.json({ error: "Document temporarily unavailable." }, { status: 503 });
  const response = NextResponse.redirect(signed.data.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
