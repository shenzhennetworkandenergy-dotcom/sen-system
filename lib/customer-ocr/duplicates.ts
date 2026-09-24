import type { CustomerSearchOption } from "@/lib/customers/search";
import type {
  DuplicateCandidate,
  DuplicateReason,
} from "@/lib/customer-ocr/types";

export type DuplicateCheckInput = {
  email: string;
  phone: string;
  companyName: string;
};

export function normalizeDuplicateText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDuplicateEmail(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

export function normalizeDuplicatePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("880") && digits.length > 10) {
    digits = `0${digits.slice(3)}`;
  }
  return digits;
}

export function scoreCustomerDuplicate(
  input: DuplicateCheckInput,
  customer: CustomerSearchOption,
): DuplicateCandidate | null {
  const reasons: DuplicateReason[] = [];
  const inputEmail = normalizeDuplicateEmail(input.email);
  const customerEmail = normalizeDuplicateEmail(customer.email);
  const inputPhone = normalizeDuplicatePhone(input.phone);
  const customerPhone = normalizeDuplicatePhone(customer.phone);
  const inputCompany = normalizeDuplicateText(input.companyName);
  const customerCompany = normalizeDuplicateText(customer.company_name);

  if (inputEmail && customerEmail && inputEmail === customerEmail) {
    reasons.push("email");
  }
  if (inputPhone && customerPhone && inputPhone === customerPhone) {
    reasons.push("phone");
  }
  if (inputCompany && customerCompany && inputCompany === customerCompany) {
    reasons.push("company");
  }

  if (!reasons.length) return null;
  return {
    customer,
    reasons,
    blocksCreation: reasons.includes("email"),
  };
}
