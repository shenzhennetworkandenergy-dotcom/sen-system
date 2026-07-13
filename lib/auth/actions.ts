"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultCountry, getCountryByCode } from "@/lib/data/countries";
import { destinationForRole, getCurrentProfile, requireAdmin, requireAuthenticatedUser } from "@/lib/auth/server";
import type { AccountRole, AccountStatus, CustomerType, Profile } from "@/lib/auth/types";

const roles: AccountRole[] = ["admin", "employee", "customer"];
const statuses: AccountStatus[] = ["active", "suspended", "disabled"];
const customerTypes: CustomerType[] = ["individual", "company"];

type ActionState = { ok?: boolean; message?: string };
type SupabaseSafeError = { code?: string; message?: string; status?: number; name?: string };

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

function getSafeSupabaseError(error: unknown): SupabaseSafeError {
  if (!error || typeof error !== "object") return {};
  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    name: typeof candidate.name === "string" ? candidate.name : undefined,
  };
}

function logSupabaseAuthError(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const safeError = getSafeSupabaseError(error);
  console.warn("[Supabase Auth]", context, {
    code: safeError.code ?? "unknown",
    message: safeError.message ?? "No message provided.",
    status: safeError.status,
    name: safeError.name,
  });
}

function authErrorMessage(error: unknown, fallback: string) {
  const safeError = getSafeSupabaseError(error);
  const code = safeError.code?.toLowerCase() ?? "";
  const message = safeError.message?.toLowerCase() ?? "";
  if (code.includes("invalid_credentials") || message.includes("invalid login credentials")) return "Invalid email or password.";
  if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) return "Please confirm your email address before signing in. If you need help, contact SEN administration.";
  if (code.includes("signup_disabled") || message.includes("signups not allowed") || message.includes("signup is disabled")) return "New account registration is currently unavailable. Please contact SEN administration.";
  if (code.includes("user_already_exists") || message.includes("already registered") || message.includes("already exists")) return "An account already exists for this email. Please sign in or contact SEN administration for help.";
  if (code.includes("unexpected_failure") || message.includes("database") || message.includes("saving new user")) return "We could not finish creating your account right now. Please try again later or contact SEN administration.";
  return fallback;
}

export async function registerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = value(formData, "fullName");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const country = getCountryByCode(value(formData, "countryCode")) ?? defaultCountry;
  const customerType = value(formData, "customerType") as CustomerType;
  const companyName = value(formData, "companyName");
  const agreed = formData.get("agreement") === "on";
  if (fullName.length < 2 || !email.includes("@") || password.length < 8 || password !== confirmPassword || !agreed) return { message: "Please provide valid registration details and accept the terms placeholder." };
  if (!customerTypes.includes(customerType)) return { message: "Please select a valid customer type." };
  if (customerType === "company" && companyName.length < 2) return { message: "Please provide the company name." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, phone, country_code: country.code, country_name: country.name, customer_type: customerType, company_name: customerType === "company" ? companyName : null } } });
  if (error) {
    logSupabaseAuthError("signUp failed", error);
    return { message: authErrorMessage(error, "We could not create your account right now. Please try again later or contact SEN administration.") };
  }
  if (!data.user) {
    logSupabaseAuthError("signUp returned no user", { code: "missing_user", message: "Supabase signUp completed without returning a user object." });
    return { message: "We could not confirm that your account was created. Please try again later or contact SEN administration." };
  }
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { message: "An account already exists for this email. Please sign in or contact SEN administration for help." };
  }
  return { ok: true, message: "Registration completed. Please sign in to continue to your SEN account." };
}

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const email = value(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || password.length < 1) return { message: "Enter your email and password." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logSupabaseAuthError("signInWithPassword failed", error);
    return { message: authErrorMessage(error, "We could not sign you in right now. Please try again later or contact SEN administration.") };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { message: "Your account profile is not ready. Please contact SEN administration." };
  if (profile.status !== "active") return { message: `Your account is ${profile.status}. Please contact SEN administration for help.` };
  await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id);
  redirect(destinationForRole(profile.role));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateOwnProfileAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAuthenticatedUser();
  const fullName = value(formData, "fullName");
  const phone = value(formData, "phone");
  const country = getCountryByCode(value(formData, "countryCode"));
  const customerType = value(formData, "customerType") as CustomerType;
  const companyName = value(formData, "companyName");
  const avatarUrl = value(formData, "avatarUrl");
  if (fullName.length < 2 || !country || !customerTypes.includes(customerType)) return { message: "Please provide valid profile details." };
  if (customerType === "company" && companyName.length < 2) return { message: "Company accounts require a company name." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName, phone: phone || null, country_code: country.code, country_name: country.name, customer_type: customerType, company_name: customerType === "company" ? companyName : null, avatar_url: avatarUrl || null }).eq("id", user.id);
  if (error) return { message: "Profile could not be updated." };
  revalidatePath("/account");
  return { ok: true, message: "Profile updated." };
}

export async function updateUserByAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const role = value(formData, "role") as AccountRole;
  const status = value(formData, "status") as AccountStatus;
  if (!roles.includes(role) || !statuses.includes(status)) throw new Error("Invalid account update.");
  const client = createSupabaseAdminClient();
  const { data: oldProfile, error: readError } = await client.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (readError || !oldProfile) throw new Error("Profile not found.");
  if (oldProfile.role === "admin" && (role !== "admin" || status !== "active")) {
    const { count } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
    if ((count ?? 0) <= 1) throw new Error("Cannot remove or disable the final active administrator.");
  }
  const { error } = await client.from("profiles").update({ role, status, updated_by: admin.id }).eq("id", userId);
  if (error) throw new Error("Unable to update account.");
  await client.from("audit_logs").insert({ actor_user_id: admin.id, actor_role: admin.role, action: role !== oldProfile.role ? "user_role_changed" : "user_status_changed", module: "admin", entity_type: "profile", entity_id: userId, description: "Admin updated account role/status.", old_values: { role: oldProfile.role, status: oldProfile.status }, new_values: { role, status } });
  revalidatePath("/admin/users");
}

