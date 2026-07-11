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
  customerPortal: "/portal",
  environmentCheck: "/environment-check",
  erp: "/erp",
} as const;

export type RouteKey = keyof typeof routes;
export type RoutePath = (typeof routes)[RouteKey] | `/${string}`;
