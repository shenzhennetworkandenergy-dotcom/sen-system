"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { persistEmployeeBusinessAccess } from "@/lib/customers/employee-business-access";

export async function saveEmployeeBusinessAccessAction(employeeId: string, form: FormData) {
  await requireProfile(["admin"]);
  const categorySlugs = form.getAll("category_slugs").map(String);
  try {
    await persistEmployeeBusinessAccess(employeeId, categorySlugs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save employee business access.";
    redirect(`/admin/users/${employeeId}?businessAccessError=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/users/${employeeId}`);
  redirect(`/admin/users/${employeeId}?businessAccessSuccess=Employee%20business%20access%20saved.`);
}
