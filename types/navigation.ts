import type { RoutePath } from "@/lib/constants/routes";

export type NavigationItem = {
  label: string;
  href: RoutePath;
  description?: string;
  isExternal?: false;
};
