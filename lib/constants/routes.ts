export const routes = {
  home: "/",
  products: "/products",
  solutions: "/solutions",
  industries: "/industries",
  about: "/about",
  contact: "/contact",
  requestQuote: "/request-quote",
  search: "/search",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  account: "/account",
  admin: "/admin",
  employee: "/employee",
  customerPortal: "/account",
  environmentCheck: "/environment-check",
  erp: "/admin",
} as const;

export type RouteKey = keyof typeof routes;
export type RoutePath = (typeof routes)[RouteKey] | `/${string}`;
