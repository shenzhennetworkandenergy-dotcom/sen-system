export type OwnerRecord = { id: string; name: string; phone_number: string | null; ownership_percentage: number; is_active: boolean };
export type UnitRecord = { id: string; unit_code: string; is_active: boolean };

export function normalizeUnitCode(value: string) {
  const code = value.trim();
  if (!code || code.length > 120) throw new Error("Unit identifier is required and must be 120 characters or fewer.");
  return code;
}

export function normalizeOwnerName(value: string) {
  const name = value.trim();
  if (!name || name.length > 200) throw new Error("Owner or heir name is required and must be 200 characters or fewer.");
  return name;
}

export function normalizeOwnerPhone(value: string) {
  const phone = value.trim();
  if (phone.length > 40) throw new Error("Phone number must be 40 characters or fewer.");
  return phone || null;
}
