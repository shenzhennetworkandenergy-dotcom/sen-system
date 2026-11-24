/** Checkout accepts one contact number, independently of the shipping country. */
export function normalizeCheckoutPhone(value: string) {
  return value.replace(/[()\s.-]/g, "");
}

export function isValidCheckoutPhone(value: string) {
  const phone = normalizeCheckoutPhone(value);
  return /^\+8801[3-9]\d{8}$/.test(phone)
    || /^01[3-9]\d{8}$/.test(phone)
    || /^\+[1-9]\d{6,14}$/.test(phone);
}

/** Offer saved alternatives for explicit selection; never submit a list as one number. */
export function checkoutPhoneOptions(values: readonly string[]) {
  return [...new Set(values.flatMap((value) => value.split(/[,;\n]+/))
    .map(normalizeCheckoutPhone)
    .filter(isValidCheckoutPhone))];
}
