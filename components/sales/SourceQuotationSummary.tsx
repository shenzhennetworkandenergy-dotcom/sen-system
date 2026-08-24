import type { QuotationSaleInitial } from "@/lib/quotations/sale-conversion-types";

const display = (value: string | null) => value?.trim() || "Not specified";

export function SourceQuotationSummary({
  quotation,
}: {
  quotation: QuotationSaleInitial;
}) {
  return (
    <section className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide">Source quotation</p>
        <h2 className="text-lg font-bold">{quotation.reference}</h2>
      </div>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="font-semibold">Payment terms</dt>
          <dd className="mt-1 whitespace-pre-wrap">{display(quotation.paymentTerms)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Delivery information</dt>
          <dd className="mt-1 whitespace-pre-wrap">{display(quotation.deliveryInformation)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Terms and conditions</dt>
          <dd className="mt-1 whitespace-pre-wrap">{display(quotation.termsAndConditions)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs">
        These approved quotation terms are shown for review and are not copied into unrelated Sale fields.
      </p>
    </section>
  );
}
