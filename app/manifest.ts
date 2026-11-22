import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.company.fullName,
    short_name: siteConfig.company.shortName,
    description: siteConfig.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#07102f",
    icons: [
      { src: "/mobile/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/mobile/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/mobile/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My account", url: "/account", icons: [{ src: "/mobile/icon-192.png", sizes: "192x192" }] },
      { name: "Products", url: "/products", icons: [{ src: "/mobile/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
