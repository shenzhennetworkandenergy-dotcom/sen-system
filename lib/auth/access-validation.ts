export const accountRoles = ["customer", "employee", "admin"] as const;
export const accountStatuses = ["active", "suspended", "disabled"] as const;
export const permissionEffects = ["allow", "deny"] as const;

export function isAccountRole(value: string): value is (typeof accountRoles)[number] {
  return accountRoles.includes(value as (typeof accountRoles)[number]);
}

export function isAccountStatus(value: string): value is (typeof accountStatuses)[number] {
  return accountStatuses.includes(value as (typeof accountStatuses)[number]);
}

export function uniqueStrings(values: FormDataEntryValue[]) {
  return [...new Set(values.map(String).filter(Boolean))];
}
