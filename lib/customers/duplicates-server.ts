import "server-only";

import {
  normalizeDuplicateEmail,
  normalizeDuplicatePhone,
  normalizeDuplicateText,
  scoreCustomerDuplicate,
  type DuplicateCheckInput,
} from "@/lib/customer-ocr/duplicates";
import type { DuplicateCandidate } from "@/lib/customer-ocr/types";
import type { CustomerSearchOption } from "@/lib/customers/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function phoneVariants(value: string) {
  const normalized = normalizeDuplicatePhone(value);
  if (!normalized) return [];
  const variants = new Set([value.trim(), normalized]);
  if (normalized.startsWith("0")) {
    variants.add(`+880${normalized.slice(1)}`);
    variants.add(`880${normalized.slice(1)}`);
  }
  return [...variants].filter(Boolean);
}

function safeCustomer(row: {
  id: unknown;
  full_name: unknown;
  company_name: unknown;
  email: unknown;
  phone: unknown;
}): CustomerSearchOption {
  return {
    id: String(row.id),
    full_name: row.full_name ? String(row.full_name) : null,
    company_name: row.company_name ? String(row.company_name) : null,
    email: String(row.email ?? ""),
    phone: row.phone ? String(row.phone) : null,
  };
}

export async function findPossibleCustomers(
  input: DuplicateCheckInput,
): Promise<DuplicateCandidate[]> {
  const email = normalizeDuplicateEmail(input.email).slice(0, 320);
  const company = normalizeDuplicateText(input.companyName).slice(0, 200);
  const phones = phoneVariants(input.phone).map((value) => value.slice(0, 50));
  if (!email && !company && !phones.length) return [];

  const db = createSupabaseAdminClient();
  const columns = "id,full_name,company_name,email,phone";
  const queries = [];
  if (email) {
    queries.push(
      db
        .from("profiles")
        .select(columns)
        .eq("role", "customer")
        .eq("status", "active")
        .ilike("email", email)
        .limit(10),
    );
  }
  if (company) {
    queries.push(
      db
        .from("profiles")
        .select(columns)
        .eq("role", "customer")
        .eq("status", "active")
        .ilike("company_name", company)
        .limit(10),
    );
  }
  if (phones.length) {
    queries.push(
      db
        .from("profiles")
        .select(columns)
        .eq("role", "customer")
        .eq("status", "active")
        .in("phone", phones)
        .limit(10),
    );
  }

  const results = await Promise.all(queries);
  const rows = new Map<string, CustomerSearchOption>();
  for (const result of results) {
    if (result.error) {
      console.error("Customer duplicate lookup failed", {
        code: result.error.code,
        message: result.error.message,
      });
      throw new Error("Unable to check existing customers.");
    }
    for (const row of result.data ?? []) {
      const customer = safeCustomer(row);
      rows.set(customer.id, customer);
    }
  }

  return [...rows.values()]
    .map((customer) => scoreCustomerDuplicate(input, customer))
    .filter((match): match is DuplicateCandidate => Boolean(match));
}
