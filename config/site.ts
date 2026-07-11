import { routes } from "@/lib/constants/routes";
import type { BusinessCategory } from "@/types/category";
import type { NavigationItem } from "@/types/navigation";

export type LinkItem = { label: string; href: string; description?: string };
export type BusinessCategoryConfig = BusinessCategory & {
  description: string;
  examples: readonly string[];
  href: string;
  accent: "blue" | "green" | "teal" | "slate";
};
export type SolutionArea = LinkItem & { useCase: string };
export type FooterGroup = { title: string; links: readonly LinkItem[] };

export type SiteConfig = {
  company: {
    shortName: "SEN";
    fullName: "Shenzhen Energy & Networks";
    logoAlt: "SEN — Shenzhen Energy & Networks";
  };
  description: string;
  brandAsset: { logo: string };
  routes: typeof routes;
  navigation: readonly NavigationItem[];
  publicCtas: { requestQuote: LinkItem; exploreProducts: LinkItem; contact: LinkItem; learnAbout: LinkItem };
  businessCategories: readonly BusinessCategoryConfig[];
  solutionAreas: readonly SolutionArea[];
  footerGroups: readonly FooterGroup[];
};

export const siteConfig = {
  company: {
    shortName: "SEN",
    fullName: "Shenzhen Energy & Networks",
    logoAlt: "SEN — Shenzhen Energy & Networks",
  },
  description:
    "SEN connects China-based technology sourcing with Bangladesh operations and global customer requirements across enterprise networking, energy, medical and industrial equipment.",
  brandAsset: { logo: "/brand/sen-logo.svg" },
  routes,
  navigation: [
    { label: "Products", href: routes.products },
    { label: "Solutions", href: routes.solutions },
    { label: "Industries", href: routes.industries },
    { label: "About", href: routes.about },
    { label: "Contact", href: routes.contact },
  ],
  publicCtas: {
    requestQuote: { label: "Request a Quote", href: routes.requestQuote },
    exploreProducts: { label: "Explore Products", href: routes.products },
    contact: { label: "Contact SEN", href: routes.contact },
    learnAbout: { label: "Learn About SEN", href: routes.about },
  },
  businessCategories: [
    { slug: "networking", label: "Networking", href: "/products/networking", accent: "blue", description: "Enterprise connectivity, data center and ISP infrastructure sourced for reliable project delivery.", examples: ["Enterprise networking", "Servers and data center", "Fiber-optic equipment", "Switching and routing", "ISP infrastructure"] },
    { slug: "energy", label: "Energy", href: "/products/energy", accent: "green", description: "Power continuity, renewable energy and industrial electrical systems for business-critical facilities.", examples: ["Solar and renewable energy", "UPS and backup power", "Batteries and inverters", "Industrial power systems", "Energy infrastructure"] },
    { slug: "medical-equipment", label: "Medical Equipment", href: "/products/medical-equipment", accent: "teal", description: "Healthcare and laboratory technologies supported through structured sourcing and quotation workflows.", examples: ["Diagnostic equipment", "Hospital technology", "Laboratory systems", "Patient monitoring", "Healthcare solutions"] },
    { slug: "others", label: "Others", href: "/products/others", accent: "slate", description: "Specialized industrial, electronics and project equipment procurement for custom requirements.", examples: ["Industrial automation", "Electronics", "Custom sourcing", "Project equipment", "Specialized procurement"] },
  ],
  solutionAreas: [
    { label: "Enterprise Network Infrastructure", href: "/solutions/enterprise-network", description: "Switching, routing, fiber and wireless foundations for resilient business connectivity.", useCase: "Corporate networks, ISPs and campus infrastructure" },
    { label: "Data Center and Server Solutions", href: "/solutions/data-center", description: "Server, rack, power and connectivity sourcing for modern compute environments.", useCase: "Data centers and enterprise IT rooms" },
    { label: "Industrial Automation", href: "/solutions/industrial-automation", description: "Automation components and control equipment for manufacturing and industrial facilities.", useCase: "Production lines and facility modernization" },
    { label: "Energy and Power Systems", href: "/solutions/energy-power", description: "UPS, inverter, battery and solar components for continuity and energy projects.", useCase: "Power backup and renewable infrastructure" },
    { label: "Medical and Laboratory Equipment", href: "/solutions/medical-lab", description: "Equipment sourcing support for hospitals, clinics and laboratory environments.", useCase: "Healthcare procurement and lab setup" },
    { label: "Global Sourcing and Procurement", href: "/solutions/sourcing-procurement", description: "Supplier discovery, quotation coordination and delivery support from China to customer locations.", useCase: "Project-based procurement programs" },
  ],
  footerGroups: [
    { title: "Company", links: [{ label: "About", href: routes.about }, { label: "Contact", href: routes.contact }, { label: "Careers", href: "/careers" }] },
    { title: "Products", links: [{ label: "Networking", href: "/products/networking" }, { label: "Energy", href: "/products/energy" }, { label: "Medical Equipment", href: "/products/medical-equipment" }, { label: "Others", href: "/products/others" }] },
    { title: "Solutions", links: [{ label: "Enterprise Network", href: "/solutions/enterprise-network" }, { label: "Data Center", href: "/solutions/data-center" }, { label: "Industrial Automation", href: "/solutions/industrial-automation" }, { label: "Sourcing and Procurement", href: "/solutions/sourcing-procurement" }] },
    { title: "Support", links: [{ label: "Request a Quote", href: routes.requestQuote }, { label: "Customer Login", href: routes.login }, { label: "Order/serial tracking", href: "/tracking" }] },
    { title: "Legal", links: [{ label: "Privacy Policy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
  ],
} as const satisfies SiteConfig;
