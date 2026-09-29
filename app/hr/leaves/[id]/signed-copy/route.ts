import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request,{params}:{params:Promise<{id:string}>}) {
  const context = await requireProfile(["employee","admin"]);
  const {id} = await params;
  const db = createSupabaseAdminClient();
  const result = await db.from("hr_leave_requests").select("employee_record_id,signed_storage_path").eq("id",id).maybeSingle();
  if (result.error || !result.data?.signed_storage_path) return NextResponse.json({error:"Signed application not found."},{status:404});
  if (context.profile.role === "employee") {
    const ownership = await db.from("hr_employee_records").select("id").eq("id",result.data.employee_record_id).eq("profile_id",context.profile.id).is("archived_at",null).maybeSingle();
    if (ownership.error || !ownership.data) return NextResponse.json({error:"Signed application not found."},{status:404});
  }
  const signed = await db.storage.from("hr-documents").createSignedUrl(result.data.signed_storage_path,60);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({error:"Unable to open the signed application."},{status:500});
  return NextResponse.redirect(signed.data.signedUrl);
}
