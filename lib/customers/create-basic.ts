import "server-only";

import type { BasicCustomerInput } from "@/lib/customers/basic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CreatedBasicCustomer = {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string;
  phone: string;
};

export async function createBasicCustomerRecord(
  input: BasicCustomerInput,
): Promise<CreatedBasicCustomer> {
  const db = createSupabaseAdminClient();
  const created = await db.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      company_name: input.companyName,
      phone: input.phone,
      role: "customer",
      status: "active",
    },
  });

  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || "Unable to add customer.");
  }

  const customerId = created.data.user.id;
  const { error: profileError } = await db
    .from("profiles")
    .update({
      full_name: input.fullName,
      company_name: input.companyName,
      phone: input.phone,
      role: "customer",
      status: "active",
    })
    .eq("id", customerId);

  if (profileError) {
    await db.auth.admin.deleteUser(customerId);
    throw new Error("Unable to save the customer profile.");
  }

  const { error: addressError } = await db.from("customer_addresses").insert({
    profile_id: customerId,
    recipient_name: input.fullName,
    phone: input.phone,
    address_line_1: input.addressLine1,
    city: "Not specified",
    country_code: "BD",
    is_default_shipping: true,
  });

  if (addressError) {
    await db.auth.admin.deleteUser(customerId);
    throw new Error("Unable to save the customer address.");
  }

  return {
    id: customerId,
    full_name: input.fullName,
    company_name: input.companyName,
    email: input.email,
    phone: input.phone,
  };
}
