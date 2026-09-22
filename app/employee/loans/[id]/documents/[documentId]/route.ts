import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { EMPLOYEE_LOAN_DOCUMENT_BUCKET } from "@/lib/receivables/employee-loans";
import { getEmployeeLoanApplication } from "@/lib/receivables/employee-loans-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  try {
    const auth = await getCurrentProfile();
    if (!auth.user || !auth.profile || auth.profile.role !== "employee" || auth.profile.status !== "active") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const access = await getEmployeeLoanApplication(id);
    if (!access.application || !access.application.documents.some((document) => document.id === documentId)) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    const db = createSupabaseAdminClient();
    const { data: document, error: metadataError } = await db.from("receivable_loan_documents").select("storage_path")
      .eq("id", documentId).eq("receivable_account_id", id).eq("employee_profile_id", auth.profile.id).maybeSingle();
    if (metadataError || !document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const signed = await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 60, { download: true });
    if (signed.error || !signed.data) return NextResponse.json({ error: "Document temporarily unavailable." }, { status: 503 });
    const response = NextResponse.redirect(signed.data.signedUrl);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Employee loan document retrieval failed", error);
    return NextResponse.json({ error: "Document temporarily unavailable." }, { status: 503 });
  }
}
