import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminRecruitmentDocument } from "@/lib/hr/admin-recruitment";
import { RECRUITMENT_DOCUMENT_BUCKET } from "@/lib/hr/recruitment-job-application";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const document = await getAdminRecruitmentDocument(documentId);
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const signed = await createSupabaseAdminClient().storage.from(RECRUITMENT_DOCUMENT_BUCKET)
      .createSignedUrl(document.storage_path, 60, download ? { download: document.original_name } : undefined);
    if (signed.error || !signed.data) return NextResponse.json({ error: "Document temporarily unavailable." }, { status: 503 });
    const response = NextResponse.redirect(signed.data.signedUrl);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
