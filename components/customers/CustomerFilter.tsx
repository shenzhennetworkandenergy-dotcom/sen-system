"use client";

import { useState } from "react";
import { CustomerTypeahead } from "./CustomerTypeahead";
import type { CustomerSearchOption } from "@/lib/customers/search";

export function CustomerFilter({ customers, initialCustomerId }: {
  customers: CustomerSearchOption[];
  initialCustomerId?: string;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");

  return (
    <CustomerTypeahead
      customers={customers}
      selectedCustomerId={customerId}
      onSelectionChange={(customer) => setCustomerId(customer?.id ?? "")}
      fieldClassName="w-full min-w-0 rounded-lg border px-3 py-2"
      labelClassName="min-w-0"
      filter
    />
  );
}
