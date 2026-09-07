import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRmbCustomerProofPath } from "@/lib/rmb-payments/data";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string; kind: string }> }) {
  const { profile } = await requireProfile(["customer"]);
  const { jobId, kind } = await params;
  if (!["customer", "china", "destination"].includes(kind)) return NextResponse.json({ error: "Proof not found." }, { status: 404 });
  const path = await getRmbCustomerProofPath(jobId, profile.id, kind as "customer" | "china" | "destination");
  if (!path) return NextResponse.json({ error: "Proof not found." }, { status: 404 });
  const signed = await createSupabaseAdminClient().storage.from("rmb-payment-proofs").createSignedUrl(path, 300, { download: false });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Proof is temporarily unavailable." }, { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl);
}
