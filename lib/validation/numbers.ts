const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoney(
  value: unknown,
  label: string,
  options: { required?: boolean; minimum?: number } = {},
) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (options.required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!MONEY_PATTERN.test(raw)) {
    throw new Error(`${label} must be a valid amount with no more than 2 decimal places.`);
  }
  const parsed = Number(raw);
  const minimum = options.minimum ?? 0;
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be at least ${minimum.toFixed(2)}.`);
  }
  return roundMoney(parsed);
}

export function parseWholeNumber(
  value: unknown,
  label: string,
  options: { required?: boolean; minimum?: number; maximum?: number } = {},
) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (options.required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!WHOLE_NUMBER_PATTERN.test(raw)) {
    throw new Error(`${label} must be a whole number without decimals.`);
  }
  const parsed = Number(raw);
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function parseSignedWholeNumber(
  value: unknown,
  label: string,
  options: { required?: boolean; allowZero?: boolean } = {},
) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (options.required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!/^[+-]?\d+$/.test(raw)) {
    throw new Error(`${label} must be a whole number without decimals.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (!options.allowZero && parsed === 0)) {
    throw new Error(`${label} must be a ${options.allowZero ? "" : "nonzero "}whole number.`);
  }
  return parsed;
}

export function moneyFromForm(
  form: FormData,
  key: string,
  label: string,
  options: { required?: boolean; minimum?: number } = {},
) {
  return parseMoney(form.get(key), label, options);
}

export function wholeNumberFromForm(
  form: FormData,
  key: string,
  label: string,
  options: { required?: boolean; minimum?: number; maximum?: number } = {},
) {
  return parseWholeNumber(form.get(key), label, options);
}
