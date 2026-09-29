import "server-only";

import type { BasicCustomerInput } from "@/lib/customers/basic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CreatedBasicCustomer = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string;
};

async function removeIncompleteCustomer(customerId: string) {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(
    customerId,
  );
  if (error) {
    console.error("Unable to remove incomplete customer", {
      customerId,
      message: error.message,
    });
  }
}

export async function createBasicCustomerRecord(
  input: BasicCustomerInput,
): Promise<CreatedBasicCustomer> {
  const db = createSupabaseAdminClient();
  const identity = input.email
    ? { email: input.email, email_confirm: true }
    : { phone: input.phone, phone_confirm: true };
  const created = await db.auth.admin.createUser({
    ...identity,
    user_metadata: {
      full_name: input.fullName,
      company_name: input.companyName,
      email: input.email,
      phone: input.phone,
      role: "customer",
      status: "active",
    },
  });

  if (created.error || !created.data.user) {
    console.error("Basic customer authentication creation failed", {
      message: created.error?.message,
    });
    throw new Error(
      /already|registered|exists/i.test(created.error?.message ?? "")
        ? "A customer with this email or phone already exists."
        : "Unable to add customer.",
    );
  }

  const customerId = created.data.user.id;
  const { error: profileError } = await db
    .from("profiles")
    .update({
      full_name: input.fullName,
      company_name: input.companyName,
      email: input.email,
      phone: input.phone,
      role: "customer",
      status: "active",
    })
    .eq("id", customerId);

  if (profileError) {
    console.error("Basic customer profile creation failed", {
      customerId,
      message: profileError.message,
    });
    await removeIncompleteCustomer(customerId);
    throw new Error("Unable to save the customer profile.");
  }

  const { error: addressError } = await db.from("customer_addresses").insert({
    profile_id: customerId,
    recipient_name: input.companyName || input.fullName!,
    phone: input.phone,
    address_line_1: input.addressLine1,
    city: "Not specified",
    country_code: "BD",
    is_default_shipping: true,
  });

  if (addressError) {
    console.error("Basic customer address creation failed", {
      customerId,
      message: addressError.message,
    });
    await removeIncompleteCustomer(customerId);
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
