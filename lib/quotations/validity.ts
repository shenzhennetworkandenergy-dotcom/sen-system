const DEFAULT_VALIDITY_DAYS = 5;
const BUSINESS_TIME_ZONE = "Asia/Dhaka";

function businessDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((entry) => entry.type === type)?.value);

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
  };
}

export function defaultQuotationExpiration(
  issueDate = new Date(),
  validityDays = DEFAULT_VALIDITY_DAYS,
) {
  const normalizedDays =
    Number.isInteger(validityDays) && validityDays > 0
      ? validityDays
      : DEFAULT_VALIDITY_DAYS;
  const businessDate = businessDateParts(issueDate);
  const expiration = new Date(
    Date.UTC(
      businessDate.year,
      businessDate.month - 1,
      businessDate.day,
    ),
  );

  expiration.setUTCDate(expiration.getUTCDate() + normalizedDays);

  return expiration.toISOString().slice(0, 10);
}
