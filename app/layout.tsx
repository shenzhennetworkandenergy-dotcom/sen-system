import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SEN — Enterprise Technology Sourcing", template: "%s | SEN" },
  description: siteConfig.description,
  applicationName: siteConfig.company.shortName,
  icons: { icon: "/icon.svg", shortcut: "/favicon.ico", apple: "/apple-icon.svg" },
  openGraph: { title: "SEN — Shenzhen Energy & Networks", description: siteConfig.description, type: "website" },
  twitter: { card: "summary", title: "SEN — Shenzhen Energy & Networks", description: siteConfig.description },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full scroll-smooth antialiased"><body className="min-h-full flex flex-col">{children}</body></html>;
}
