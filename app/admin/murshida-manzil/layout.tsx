import type { Metadata } from "next";
import { requireMurshidaAccess, isAccountsRequest } from "@/lib/murshida-manzil/accounts-session";
import { AccountsShell } from "@/components/murshida-manzil/AccountsShell";
import styles from "./murshida.module.css";

export const metadata: Metadata = { title: { absolute: "Murshida Manzil Accounts" }, robots: { index: false, follow: false } };

export default async function MurshidaManzilLayout({ children }: { children: React.ReactNode }) {
  const { viewer } = await requireMurshidaAccess();
  const content = <div className={styles.page}>{children}</div>;
  return await isAccountsRequest() ? <AccountsShell viewer={viewer}>{content}</AccountsShell> : content;
}
