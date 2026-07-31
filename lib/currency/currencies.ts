export type CurrencyOption = {
  code: string;
  name: string;
};

const fallbackCodes = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
  "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD",
  "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR",
  "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF",
  "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
  "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR",
  "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR",
  "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR",
  "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD",
  "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS",
  "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD",
  "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF",
  "YER", "ZAR", "ZMW", "ZWL",
] as const;

const supportedValuesOf = (
  Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] }
).supportedValuesOf;

const codes = supportedValuesOf
  ? supportedValuesOf("currency")
  : [...fallbackCodes];

const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });

export const currencyOptions: CurrencyOption[] = [...new Set(codes)]
  .map((code) => ({ code, name: displayNames.of(code) ?? code }))
  .sort((left, right) => left.code.localeCompare(right.code));

export function normalizeCurrencyCode(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error("Currency must use a three-letter code.");
  }
  return code;
}

export function filterCurrencyOptions(query: unknown, limit = 20) {
  const term = String(query ?? "").trim().toLowerCase();
  const matches = term
    ? currencyOptions.filter(
        (option) =>
          option.code.toLowerCase().includes(term) ||
          option.name.toLowerCase().includes(term),
      )
    : currencyOptions;
  return matches.slice(0, Math.max(1, limit));
}

