export type EmployeeOption = {
  id: string;
  employeeNumber: string;
  name: string;
  email: string;
  label: string;
  searchText: string;
};

type EmployeeOptionSource = {
  id: string;
  employee_number: string;
  profiles:
    | { full_name?: string | null; email?: string | null }
    | { full_name?: string | null; email?: string | null }[]
    | null;
};

export function buildEmployeeOptions(
  rows: EmployeeOptionSource[],
): EmployeeOption[] {
  return rows.map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0] ?? null
      : row.profiles;
    const name = String(profile?.full_name ?? "").trim();
    const email = String(profile?.email ?? "").trim();
    const employeeNumber = String(row.employee_number ?? "").trim();
    const primary = name || email || employeeNumber;
    const label = employeeNumber && primary !== employeeNumber
      ? `${primary} · ${employeeNumber}`
      : primary;
    return {
      id: row.id,
      employeeNumber,
      name,
      email,
      label,
      searchText: `${name} ${email} ${employeeNumber}`.toLowerCase(),
    };
  });
}

export function filterEmployeeOptions(
  options: EmployeeOption[],
  query: unknown,
  limit = 50,
) {
  const term = String(query ?? "").trim().toLowerCase();
  const matches = term
    ? options.filter((option) => option.searchText.includes(term))
    : options;
  return matches.slice(0, Math.max(1, limit));
}

