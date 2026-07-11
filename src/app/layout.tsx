import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEN Platform",
  description: "SEN Platform production-ready Next.js application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
