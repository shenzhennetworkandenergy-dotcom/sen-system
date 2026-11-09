export const quotationStatuses = [
  "draft", "submitted", "reviewing", "quoted", "accepted", "declined",
  "additional_info_required", "approved", "rejected", "expired",
  "converted_to_sale", "converted_to_invoice", "closed",
];

export function quotationDayRange(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.getUTCFullYear() < 1 || day.toISOString().slice(0, 10) !== value) return null;
  day.setUTCDate(day.getUTCDate() + 1);
  if (day.getUTCFullYear() > 9999) return null;
  // Quotation dates use the ERP's Bangladesh business day, not the server timezone.
  return { start: `${value}T00:00:00+06:00`, end: `${day.toISOString().slice(0, 10)}T00:00:00+06:00` };
}

export function literalQuotationPattern(value: string) {
  return `%${value.replace(/[\\%_*]/g, "\\$&")}%`;
}

export function quotationListFilters(params: Record<string, string | string[] | undefined>) {
  const text = (name: string) => typeof params[name] === "string" ? params[name].trim() : "";
  const q = text("q"), date = text("date"), customer = text("customer"), status = text("status");
  const range = date ? quotationDayRange(date) : null;
  const invalid = ["q", "date", "customer", "status"].some(key => Array.isArray(params[key]))
    || q.length > 80 || (date !== "" && !range)
    || (customer !== "" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer))
    || (status !== "" && !quotationStatuses.includes(status));
  return { q: q.slice(0, 80), date: range ? date : "", customer, status,
    range, error: invalid ? "Invalid quotation filters. Clear filters and try again." : null };
}
