import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireProfile();
  const { id } = await params;
  if (!uuidPattern.test(id)) return new NextResponse("Not found", { status: 404 });

  const db = createSupabaseAdminClient();
  const { data: attachment, error } = await db
    .from("rma_attachments")
    .select("id,storage_path,rma_claim_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !attachment) return new NextResponse("Not found", { status: 404 });

  const { data: claim, error: claimError } = await db
    .from("rma_claims")
    .select("customer_profile_id")
    .eq("id", attachment.rma_claim_id)
    .maybeSingle();
  if (claimError || !claim) return new NextResponse("Not found", { status: 404 });

  const customerOwnsClaim = profile.role === "customer" && claim.customer_profile_id === profile.id;
  const staffAllowed = profile.role === "admin" || (profile.role === "employee" && await hasPermission(profile.id, "rma.view"));
  if (!customerOwnsClaim && !staffAllowed) return new NextResponse("Forbidden", { status: 403 });

  const { data: signed, error: signedError } = await db.storage.from("rma-attachments").createSignedUrl(attachment.storage_path, 120);
  if (signedError || !signed?.signedUrl) return new NextResponse("Attachment unavailable", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
