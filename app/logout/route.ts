import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle() : { data: null };
  if (profile) await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "auth.logout", module: "auth", entityType: "profile", entityId: profile.id, targetProfileId: profile.id, description: "User signed out." });
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/employee", "layout");
  revalidatePath("/account", "layout");
  redirect("/");
}
