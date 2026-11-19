import Image from "next/image";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/Shell";
import { isAccountsRequest, type MurshidaAccess } from "@/lib/murshida-manzil/accounts-session";
import { MURSHIDA_ROOT } from "@/lib/murshida-manzil/accounts-routing";
import styles from "./accounts.module.css";

const links = [
  ["Overview & entries", ""], ["Rent history", "/history/rent"], ["Advance history", "/history/advance"],
  ["Expense history", "/history/expense"], ["Owner rent account", "/reports/owner-rent-account"],
  ["Owner income", "/reports/owner-income"], ["Monthly income", "/reports/monthly-owner-income"],
];

export function AccountsShell({ children, viewer }: { children: React.ReactNode; viewer: MurshidaAccess["viewer"] }) {
  return <div className={styles.accounts}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={MURSHIDA_ROOT} className={styles.brand} prefetch={false}>
          <Image src="/murshida-manzil/murshida-seal.png" alt="" width={48} height={48} />
          <span><strong>Murshida Manzil Accounts</strong><small>মুর্শিদা মঞ্জিল · murshidaproperties.sen.com.bd</small></span>
        </Link>
        <div className={styles.accountLinks}><span>{viewer.name}</span><span>{viewer.canManage ? "Super Admin" : "শুধু দেখার অনুমতি"}</span>
          {/* Cross-application navigation must reload the Properties page. */}
          <a href={viewer.isSuperAdmin ? "/admin/" : "/portal/"}>আমার পোর্টাল</a>
        </div>
      </div>
      <nav className={styles.navigation} aria-label="Murshida Manzil accounts">
        {links.map(([label, suffix]) => <Link key={suffix} href={`${MURSHIDA_ROOT}${suffix}`} prefetch={false}>{!suffix && !viewer.canManage ? "Overview" : label}</Link>)}
      </nav>
    </header>
    <div className={styles.content}>{children}</div>
    <footer className={styles.footer}>মুর্শিদা মঞ্জিল · Property accounts</footer>
  </div>;
}

export async function MurshidaDashboardShell(props: { title: string; subtitle: string; children: React.ReactNode; admin?: boolean }) {
  if (!(await isAccountsRequest())) return <DashboardShell {...props} />;
  return <><div className={styles.pageTitle}><h1>{props.title}</h1><p>{props.subtitle}</p></div>{props.children}</>;
}
