import type { Metadata } from "next";
import { Suspense } from "react";

import { siteConfig } from "@/config/site";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { JsonLd } from "@/components/seo/JsonLd";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sen.com.bd"),
  title: { default: "SEN — Shenzhen Energy & Networks", template: "%s | SEN" },
  description: siteConfig.description,
  applicationName: siteConfig.company.shortName,
  keywords: ["enterprise networking", "servers Bangladesh", "technology sourcing China", "energy equipment", "medical equipment", "SEN Bangladesh"],
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: { title: "SEN — Shenzhen Energy & Networks", description: siteConfig.description, type: "website", url: "/", siteName: "SEN", locale: "en_BD", images: [{ url: "/brand/sen-official-logo.png", alt: siteConfig.company.logoAlt }] },
  twitter: { card: "summary", title: "SEN — Shenzhen Energy & Networks", description: siteConfig.description },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth"><body suppressHydrationWarning className="min-h-full flex flex-col"><JsonLd data={{"@context":"https://schema.org","@type":"Organization",name:siteConfig.company.fullName,alternateName:siteConfig.company.shortName,url:"https://sen.com.bd",logo:"https://sen.com.bd/brand/sen-official-logo.png",description:siteConfig.description,contactPoint:{"@type":"ContactPoint",telephone:"+8801805226599",contactType:"sales and customer support",areaServed:["BD","CN"],availableLanguage:["English","Bengali"]},address:{"@type":"PostalAddress",streetAddress:"House 67, Level 3, Laboratory Road, New Elephant Road",addressLocality:"Dhaka",postalCode:"1205",addressCountry:"BD"}}}/><JsonLd data={{"@context":"https://schema.org","@type":"WebSite",name:siteConfig.company.fullName,url:"https://sen.com.bd",potentialAction:{"@type":"SearchAction",target:"https://sen.com.bd/products?q={search_term_string}","query-input":"required name=search_term_string"}}}/><Suspense fallback={null}><NavigationProgress/></Suspense>{children}</body></html>;
}
