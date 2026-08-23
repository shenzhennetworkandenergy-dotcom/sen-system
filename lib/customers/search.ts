export type CustomerSearchOption = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  company_name: string | null;
};

export function customerOptionLabel(customer: CustomerSearchOption) {
  return `${customer.full_name || customer.email} · ${customer.email}`;
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
