import { NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request,{ params }: { params: Promise<{ id:string }> }) {
  await requireHrAdmin();
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const document = await db.from("hr_employee_documents").select("storage_path").eq("id",id).is("archived_at",null).maybeSingle();
  if (document.error || !document.data) return NextResponse.json({ error:"Document not found." },{ status:404 });
  const signed = await db.storage.from("hr-documents").createSignedUrl(document.data.storage_path,60);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error:"Unable to open document." },{ status:500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
