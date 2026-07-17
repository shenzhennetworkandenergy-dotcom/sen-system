import { routes } from "@/lib/constants/routes";
import type { ProfileRole } from "@/lib/auth/types";

export function destinationForRole(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return routes.admin;
    case "employee":
      return routes.employee;
    case "customer":
      return routes.account;
  }
}

export function dashboardLabelForRole(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "Admin Dashboard";
    case "employee":
      return "Employee Dashboard";
    case "customer":
      return "My Account";
  }
}

export function dashboardTitleForRole(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "Admin Dashboard";
    case "employee":
      return "Employee Workspace";
    case "customer":
      return "Customer Account";
  }
}
