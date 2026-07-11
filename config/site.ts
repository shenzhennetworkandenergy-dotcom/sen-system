import { routes } from "@/lib/constants/routes";
import type { BusinessCategory } from "@/types/category";
import type { NavigationItem } from "@/types/navigation";

export type SiteContactPlaceholders = {
  general: string;
  sales: string;
  support: string;
};

export type SiteConfig = {
  company: {
    shortName: "SEN";
    fullName: "Shenzhen Energy & Networks";
  };
  description: string;
  routes: typeof routes;
  navigation: readonly NavigationItem[];
  businessCategories: readonly BusinessCategory[];
  contact: SiteContactPlaceholders;
};

export const siteConfig = {
  company: {
    shortName: "SEN",
    fullName: "Shenzhen Energy & Networks",
  },
  description:
    "SEN is building an integrated enterprise platform for technology sourcing, product operations, customer workflows and internal business management.",
  routes,
  navigation: [
    { label: "Home", href: routes.home },
    { label: "Products", href: routes.products },
    { label: "About", href: routes.about },
    { label: "Contact", href: routes.contact },
  ],
  businessCategories: [
    { slug: "networking", label: "Networking" },
    { slug: "energy", label: "Energy" },
    { slug: "medical-equipment", label: "Medical Equipment" },
    { slug: "others", label: "Others" },
  ],
  contact: {
    general: "General contact details to be confirmed",
    sales: "Sales contact details to be confirmed",
    support: "Support contact details to be confirmed",
  },
} as const satisfies SiteConfig;
