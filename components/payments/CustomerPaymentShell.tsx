import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { Container } from "@/components/ui/Container";

export function CustomerPaymentShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PublicHeader />
      <main className="min-h-[70vh] bg-slate-50 py-6 text-slate-950 sm:py-10">
        <Container>
          <nav
            aria-label="Shopping account"
            className="mb-5 flex flex-wrap gap-4 text-sm font-semibold"
          >
            <Link href="/products">Products</Link>
            <Link href="/cart">Your cart</Link>
            <Link href="/account/orders">My orders</Link>
            <Link href="/account/addresses">Shipping addresses</Link>
          </nav>
          <header className="mb-5 rounded-2xl border bg-white p-5">
            <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          </header>
          {children}
        </Container>
      </main>
      <PublicFooter />
    </>
  );
}
