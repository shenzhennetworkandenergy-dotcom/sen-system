export type WorkLocationRecord = {
  name: string;
  code: string;
  city: string | null;
  country_code: string | null;
};

export type WarehouseRecord = {
  name: string;
  code: string;
  address: string | null;
  country_name: string | null;
};

export type WorkLocationAssignment = {
  work_locations: WorkLocationRecord | WorkLocationRecord[] | null;
} | null;

export type WarehouseAssignment = {
  warehouses: WarehouseRecord | WarehouseRecord[] | null;
} | null;

export type EmployeeWorkplaceSummary = {
  workplace: { name: string; code: string; location: string } | null;
  warehouse: { name: string; code: string; location: string } | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function buildEmployeeWorkplaceSummary(
  workplaceAssignment: WorkLocationAssignment,
  warehouseAssignment: WarehouseAssignment,
): EmployeeWorkplaceSummary {
  const workplace = firstRelation(workplaceAssignment?.work_locations);
  const warehouse = firstRelation(warehouseAssignment?.warehouses);

  return {
    workplace: workplace
      ? {
          name: workplace.name,
          code: workplace.code,
          location: [workplace.city, workplace.country_code].filter(Boolean).join(", ") || "Location not recorded",
        }
      : null,
    warehouse: warehouse
      ? {
          name: warehouse.name,
          code: warehouse.code,
          location: [warehouse.address, warehouse.country_name].filter(Boolean).join(" · ") || "Location not recorded",
        }
      : null,
  };
}

export function employeeAssignmentRevalidationPaths(profileId: string) {
  return [`/admin/users/${profileId}`, "/employee/profile", "/profile"];
}
