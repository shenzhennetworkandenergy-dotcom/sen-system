export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function defaultQuotationExpirationDate(
  issueDate = new Date().toISOString().slice(0, 10),
): string {
  return addCalendarDays(issueDate, 5);
}

export function resolveQuotationExpirationDate(
  expirationDate: string | null | undefined,
  createdAt: string,
): string {
  return (
    expirationDate ||
    defaultQuotationExpirationDate(createdAt.slice(0, 10))
  );
}
