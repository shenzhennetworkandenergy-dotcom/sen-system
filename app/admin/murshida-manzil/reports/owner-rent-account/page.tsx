import { requireProfile } from "@/lib/auth/session";
import { getOwnerRentAccountData, listOwnerRentAccountOwners } from "@/lib/murshida-manzil/repository";
import { buildOwnerRentAccountReport } from "@/lib/murshida-manzil/reports";
import { PrintButton } from "@/app/admin/murshida-manzil/_components/PrintButton";
import styles from "../../print-documents.module.css";

export const dynamic = "force-dynamic";
const years = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 5 + index);
const money = (value: number) => `৳${value.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export default async function OwnerRentAccountPage({ searchParams }: { searchParams?: Promise<{ owner?: string; year?: string; from?: string; to?: string; beginning?: string }> }) {
  await requireProfile(["admin"]);
  const filters = await searchParams ?? {};
  const owners = await listOwnerRentAccountOwners();
  const selectedOwner = owners.find((owner) => owner.id === filters.owner);
  const year = Number(filters.year) || new Date().getFullYear();
  const from = filters.beginning ? undefined : filters.from || `${year}-01-01`;
  const to = filters.beginning ? undefined : filters.to || `${year}-12-31`;
  const report = selectedOwner ? await getOwnerRentAccountData(selectedOwner.id) : null;
  const allData = report ? buildOwnerRentAccountReport(report) : null;
  const selectedData = report ? buildOwnerRentAccountReport({ ...report, from, to }) : null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = allData?.monthly.find((row) => row.month === currentMonth);
  const thisMonthShare = thisMonth?.ownerShare ?? 0;
  const thisMonthExpenseShare = thisMonth?.expenseShare ?? 0;
  const thisMonthNetBalance = thisMonth?.netBalance ?? 0;
  const selectedPeriodTotal = selectedData?.selectedPeriodTotal ?? 0;
  const fromBeginningTotal = allData?.fromBeginningTotal ?? 0;

  return (
    <main className={styles.documentScreen}>
      <article className={styles.document}>
        <header className={styles.letterhead}>
          <img className={styles.seal} src="/murshida-manzil/murshida-seal.png" alt="Murshida Manzil official seal" />
          <img className={styles.architecture} src="/murshida-manzil/murshida-architecture.png" alt="Murshida Manzil architectural artwork" />
          <div className={styles.brand}><h1>মুর্শিদা মঞ্জিল</h1><h2>মালিক ভাড়া হিসাব বিবরণী</h2><p>OWNER RENT ACCOUNT STATEMENT</p></div>
          <div className={styles.generated}><span>Report generated</span><strong>{new Date().toLocaleDateString("en-BD")}</strong></div>
        </header>
        <div className={styles.content}>
          <form method="get" className={styles.reportControls}>
            <label className={styles.controlLabel}>Owner<select name="owner" required defaultValue={filters.owner ?? ""}><option value="">Select Owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.is_active ? "" : " · Archived"}</option>)}</select></label>
            <label className={styles.controlLabel}>Year<select name="year" defaultValue={String(year)}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className={styles.controlLabel}>From<input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
            <label className={styles.controlLabel}>To<input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
            <button className={styles.primaryButton}>Generate Report</button>
            {selectedOwner ? <a className={styles.secondaryButton} href={`?owner=${selectedOwner.id}&beginning=1`}>From Beginning</a> : null}
            <div className={styles.printAction}><PrintButton /></div>
          </form>
          {selectedOwner && allData && selectedData ? <>
            <h2 className={styles.sectionTitle}>মালিকের তথ্য · Owner Information</h2>
            <section className={styles.ownerInfo}>
              <div className={styles.infoCard}><span>Owner Name</span><strong>{selectedOwner.name}</strong></div>
              <div className={styles.infoCard}><span>Phone Number</span><strong>{selectedOwner.phone_number ?? "—"}</strong></div>
              <div className={styles.infoCard}><span>Current Status</span><strong className={selectedOwner.is_active ? styles.statusPill : undefined}>{selectedOwner.is_active ? "Active" : "Archived / Inactive"}</strong></div>
              <div className={styles.infoCard}><span>Current Ownership %</span><strong>{selectedOwner.ownership_percentage}%</strong></div>
              <div className={styles.infoCard}><span>This Month Gross Rent Share</span><strong>{money(thisMonthShare)}</strong></div><div className={styles.infoCard}><span>This Month Expense Share</span><strong>-{money(thisMonthExpenseShare)}</strong></div><div className={styles.infoCard}><span>This Month Net Owner Balance</span><strong>{money(thisMonthNetBalance)}</strong></div>
            </section>
            <section className={styles.summaryGrid}><div className={`${styles.summaryCard} ${styles.summaryHighlight}`}><span>Selected Period Gross Rent Share</span><strong>{money(selectedData.selectedPeriodGrossRentShare)}</strong><p>{filters.beginning ? "From beginning through today" : `${from} – ${to}`}</p></div><div className={styles.summaryCard}><span>Selected Period Expense Share</span><strong>-{money(selectedData.selectedPeriodExpenseShare)}</strong><p>Eligible owner expenses</p></div><div className={styles.summaryCard}><span>Selected Period Net Owner Balance</span><strong>{money(selectedData.selectedPeriodNetBalance)}</strong><p>Gross rent share less expense share</p></div><div className={styles.summaryCard}><span>Total Gross Rent Share — From Beginning</span><strong>{money(allData.fromBeginningGrossRentShare)}</strong><p>Historical owner allocations</p></div><div className={styles.summaryCard}><span>Total Expense Share — From Beginning</span><strong>-{money(allData.fromBeginningExpenseShare)}</strong><p>Persisted expense allocations</p></div><div className={styles.summaryCard}><span>Net Owner Balance — From Beginning</span><strong>{money(allData.fromBeginningNetBalance)}</strong><p>Derived from authoritative allocations</p></div></section>
            <section className={styles.monthlySection}><h2 className={styles.sectionTitle}>মাসওয়ারি ভাড়া বিবরণী · Monthly Owner Account</h2>{selectedData.monthly.length ? selectedData.monthly.map((month) => <details key={month.month} open className={styles.monthBlock}><summary>{monthLabel(month.month)} — Net {money(month.netBalance)}</summary>{month.transactions.length ? <div className={styles.tableWrap}><table className={styles.reportTable}><thead><tr><th>Date</th><th>Tenant</th><th>Unit</th><th>Rent Month</th><th>Eligible Rent</th><th>Owner %</th><th>Gross Share</th></tr></thead><tbody>{month.transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.date}</td><td>{transaction.tenantName}</td><td>{transaction.unitSnapshot || "—"}</td><td>{transaction.rentMonth}/{transaction.rentYear}</td><td>{money(transaction.eligibleRentIncome)}</td><td>{transaction.ownerPercentage}%</td><td>{money(transaction.ownerShare)}</td></tr>)}</tbody></table></div> : null}{month.expenses.length ? <div className={styles.tableWrap}><table className={styles.reportTable}><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Total Expense</th><th>Owner %</th><th>Expense Share</th></tr></thead><tbody>{month.expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{expense.description}</td><td>{expense.category || "—"}</td><td>{money(expense.totalExpense)}</td><td>{expense.ownerPercentage}%</td><td>-{money(expense.ownerExpenseShare)}</td></tr>)}</tbody></table></div> : null}<p className={styles.monthlyTotal}>Gross Rent Share: {money(month.ownerShare)} · Expense Share: -{money(month.expenseShare)} · Net Balance: {money(month.netBalance)}{month.ownerPercentage === null ? " · Historical percentages varied" : ` · ${month.ownerPercentage}% snapshot`}</p></details>) : <p className={styles.emptyState}>No rent or owner expense allocations in the selected period.</p>}</section>
            <div className={styles.grandTotal} data-rent-share={selectedData.selectedPeriodTotal} data-rent-share-from-beginning={allData.fromBeginningTotal}><span>মোট মালিকের নিট হিসাব · NET OWNER BALANCE</span><strong>{money(selectedData.selectedPeriodNetBalance)}</strong></div>
            <div className={styles.signatures}><div className={styles.signature}>প্রস্তুতকারী<small>Prepared By</small></div><div className={styles.signature}>অনুমোদনকারী<small>Approved By</small></div><div className={styles.signature}>গ্রহণকারী<small>Receiver</small></div><img className={styles.signatureSeal} src="/murshida-manzil/murshida-seal.png" alt="Murshida Manzil official seal" /></div>
          </> : <p className={styles.emptyState}>Select an owner with rent allocations to view the account.</p>}
        </div>
        <footer className={styles.footer}>মুর্শিদা মঞ্জিল · Owner Rent Account Statement · Property administration</footer>
      </article>
    </main>
  );
}
