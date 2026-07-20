export const routes = {
  home: "/",
  products: "/products",
  solutions: "/solutions",
  industries: "/industries",
  about: "/about",
  contact: "/contact",
  search: "/search",
  requestQuote: "/request-quote",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  logout: "/logout",
  account: "/account",
  employee: "/employee",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminPermissions: "/admin/permissions",
  adminActivity: "/admin/activity",
  employeeActivity: "/employee/activity",
  environmentCheck: "/environment-check",
} as const;

export type AccountRole = "customer" | "employee" | "admin";
export type AccountStatus = "active" | "suspended" | "disabled";

export function dashboardPathForRole(role?: string | null) {
  if (role === "admin") return routes.admin;
  if (role === "employee") return routes.employee;
  return routes.account;
}
