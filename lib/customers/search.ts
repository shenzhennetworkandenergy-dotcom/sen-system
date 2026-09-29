export type CustomerIdentity = {
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone?: string | null;
};

export type CustomerSearchOption = CustomerIdentity & { id: string };

export function customerPrimaryName(customer: CustomerIdentity) {
  return (
    customer.company_name?.trim() ||
    customer.full_name?.trim() ||
    customer.email?.trim() ||
    "Customer"
  );
}

export function customerSecondaryLabel(customer: CustomerIdentity) {
  const contact =
    customer.company_name?.trim() && customer.full_name?.trim()
      ? `Contact: ${customer.full_name.trim()}`
      : null;

  return [contact, customer.email, customer.phone]
    .filter(Boolean)
    .join(" · ");
}

export function customerOptionLabel(customer: CustomerSearchOption) {
  return [customerPrimaryName(customer), customerSecondaryLabel(customer)]
    .filter(Boolean)
    .join(" · ");
}

export function filterCustomerOptions(
  customers: CustomerSearchOption[],
  query: string,
  limit = 20,
) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized || limit <= 0) return [];

  return customers
    .filter((customer) =>
      [
        customer.full_name,
        customer.company_name,
        customer.email,
        customer.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .slice(0, limit);
}
