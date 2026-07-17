"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function registerAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const metadata = { full_name: formData.get("full_name"), phone: formData.get("phone"), country: formData.get("country"), customer_type: formData.get("customer_type"), company_name: formData.get("company_name") };
  const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect("/account");
}
