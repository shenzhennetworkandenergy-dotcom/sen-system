export const routes = {
  home: "/",
  products: "/products",
  about: "/about",
  contact: "/contact",
  login: "/login",
  customerPortal: "/portal",
  erp: "/erp",
} as const;

export type RouteKey = keyof typeof routes;
export type RoutePath = (typeof routes)[RouteKey];
