import { NextResponse } from "next/server";

import { requireQuotationView } from "@/lib/quotations/access";
import { quotationCustomerOptions } from "@/lib/quotations/customer-options";

export async function GET(request: Request) {
  const context = await requireQuotationView();
  const values = new URL(request.url).searchParams.getAll("q");
  const q = values[0]?.trim() ?? "";
  const headers = { "Cache-Control": "private, no-store" };
  if (values.length !== 1 || !q || q.length > 80) return NextResponse.json({ customers: [] }, { headers });
  try {
    const customers = await quotationCustomerOptions(context, { q });
    return NextResponse.json({ customers }, { headers });
  } catch {
    return NextResponse.json({ error: "Customer search unavailable. Try again later." }, { status: 503, headers });
  }
}
