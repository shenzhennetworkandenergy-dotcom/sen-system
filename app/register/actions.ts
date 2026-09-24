"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { backendMode } from "@/lib/backend/config";
import { createLocalSession, registerLocalCustomer } from "@/lib/auth/local-session";

export async function registerAction(formData: FormData) {
  if (backendMode() === "native") {
    let profileId: string;
    try {
      profileId = await registerLocalCustomer({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        fullName: String(formData.get("full_name") ?? ""),
        phone: String(formData.get("phone") ?? "").trim() || null,
        country: String(formData.get("country") ?? "").trim() || null,
        customerType: String(formData.get("customer_type") ?? "individual"),
        companyName: String(formData.get("company_name") ?? "").trim() || null,
      });
      await createLocalSession(profileId);
    } catch (error) {
      const message = error instanceof Error && /password|email|duplicate|unique/i.test(error.message) ? error.message : "Unable to create local account.";
      redirect(`/register?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/", "layout");
    redirect("/account");
  }
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const metadata = { full_name: formData.get("full_name"), phone: formData.get("phone"), country: formData.get("country"), customer_type: formData.get("customer_type"), company_name: formData.get("company_name") };
  const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  revalidatePath("/account", "layout");
  redirect("/account");
}
