import { routes } from "@/lib/constants/routes";
import type { BusinessCategory } from "@/types/category";
import type { NavigationItem } from "@/types/navigation";

export type LinkItem = { label: string; href: string; description?: string };
export type ContactInfo = { legalName: string; displayName: string; addressLines: readonly string[]; phoneDisplay: string; telephoneLink: string; whatsappLink: string };
export type BusinessCategoryConfig = BusinessCategory & { description: string; examples: readonly string[]; href: string; accent: "blue" | "green" | "teal" | "slate"; image: { src: string; alt: string } };
export type FooterGroup = { title: string; links: readonly LinkItem[] };
export type SolutionArea = LinkItem & { useCase: string };
export type SiteConfig = { company: { shortName: "SEN"; fullName: "Shenzhen Energy & Networks"; logoAlt: string }; contact: ContactInfo; description: string; brandAsset: { logo: string }; routes: typeof routes; navigation: readonly NavigationItem[]; publicCtas: { requestQuote: LinkItem; exploreProducts: LinkItem; contact: LinkItem; learnAbout: LinkItem }; businessCategories: readonly BusinessCategoryConfig[]; solutionAreas: readonly SolutionArea[]; footerGroups: readonly FooterGroup[] };

export const siteConfig = {
  company: { shortName: "SEN", fullName: "Shenzhen Energy & Networks", logoAlt: "SEN — Shenzhen Energy & Networks" },
  contact: { legalName: "SHENZHEN ENERGY AND NETWORKS", displayName: "Shenzhen Energy & Networks", addressLines: ["House-67, Level-3, Laboratory Road,", "New Elephant Road (Backside of Multiplan Center),", "Dhaka-1205, Bangladesh"], phoneDisplay: "+8801805226599", telephoneLink: "tel:+8801805226599", whatsappLink: "https://wa.me/8801805226599" },
  description: "SEN connects China-based technology sourcing with Bangladesh operations and global customer requirements across enterprise networking, energy, medical and industrial equipment.",
  brandAsset: { logo: "/brand/sen-logo.svg" },
  routes,
  navigation: [{ label: "Products", href: routes.products }, { label: "Solutions", href: routes.solutions }, { label: "Industries", href: routes.industries }, { label: "About", href: routes.about }, { label: "Contact", href: routes.contact }],
  publicCtas: { requestQuote: { label: "Request a Quote", href: routes.requestQuote }, exploreProducts: { label: "Explore Products", href: routes.products }, contact: { label: "Contact SEN", href: routes.contact }, learnAbout: { label: "Learn About SEN", href: routes.about } },
  businessCategories: [
    { slug: "networking", label: "Networking", href: "/products/networking", accent: "blue", description: "Enterprise routing, switching, fiber and data-center connectivity for reliable infrastructure projects.", examples: ["Core switches", "Enterprise routers", "Fiber optics", "Server racks"], image: { src: "/images/categories/core-network-router-switch.webp", alt: "Enterprise network switches and fiber optic cabling in a data-center rack" } },
    { slug: "energy", label: "Energy", href: "/products/energy", accent: "green", description: "UPS, inverter, solar and industrial electrical systems for business-critical continuity.", examples: ["Industrial UPS", "Solar inverters", "Power electronics", "Battery systems"], image: { src: "/images/products/industrial-ups-inverter.webp", alt: "Industrial power electronics and inverter equipment in a technical room" } },
    { slug: "medical-equipment", label: "Medical Equipment", href: "/products/medical-equipment", accent: "teal", description: "Healthcare and laboratory technology sourced through structured quotation workflows.", examples: ["Patient monitors", "Ultrasound systems", "Lab analysers", "Hospital technology"], image: { src: "/images/categories/medical-patient-monitor.webp", alt: "Modern patient monitoring and diagnostic equipment in a hospital environment" } },
    { slug: "others", label: "Others / Industrial Technology", href: "/products/others", accent: "slate", description: "Automation, electronics and specialized project equipment for custom procurement needs.", examples: ["PLC controls", "Servo systems", "Automation panels", "Industrial electronics"], image: { src: "/images/categories/plc-industrial-automation.webp", alt: "Industrial automation control cabinet with PLC modules and wiring" } },
  ],
  solutionAreas: [
    { label: "Enterprise Network Infrastructure", href: "/solutions", description: "Switching, routing, fiber and wireless foundations for resilient business connectivity.", useCase: "Corporate networks, ISPs and campus infrastructure" },
    { label: "Data Center and Server Solutions", href: "/solutions", description: "Server, rack, power and connectivity sourcing for modern compute environments.", useCase: "Data centers and enterprise IT rooms" },
    { label: "Industrial Automation", href: "/solutions", description: "Automation components and control equipment for manufacturing and industrial facilities.", useCase: "Production lines and facility modernization" },
    { label: "Energy and Power Systems", href: "/solutions", description: "UPS, inverter, battery and solar components for continuity and energy projects.", useCase: "Power backup and renewable infrastructure" },
    { label: "Medical and Laboratory Equipment", href: "/solutions", description: "Equipment sourcing support for hospitals, clinics and laboratory environments.", useCase: "Healthcare procurement and lab setup" },
    { label: "Global Sourcing and Procurement", href: "/solutions", description: "Supplier discovery, quotation coordination and delivery support from China to customer locations.", useCase: "Project-based procurement programs" },
  ],
  footerGroups: [
    { title: "Company", links: [{ label: "About", href: routes.about }, { label: "Contact", href: routes.contact }] },
    { title: "Products", links: [{ label: "Networking", href: "/products/networking" }, { label: "Energy", href: "/products/energy" }, { label: "Medical Equipment", href: "/products/medical-equipment" }, { label: "Others", href: "/products/others" }] },
    { title: "Solutions", links: [{ label: "Enterprise Network", href: "/solutions" }, { label: "Data Center", href: "/solutions" }, { label: "Industrial Automation", href: "/solutions" }] },
    { title: "Support", links: [{ label: "Request a Quote", href: routes.requestQuote }, { label: "Call SEN", href: "tel:+8801805226599" }] },
  ],
} as const satisfies SiteConfig;
