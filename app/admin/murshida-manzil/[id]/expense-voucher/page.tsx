import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getExpense } from "@/lib/murshida-manzil/repository";
import { PrintButton } from "@/app/admin/murshida-manzil/_components/PrintButton";
import styles from "../../print-documents.module.css";

export const dynamic = "force-dynamic";

export default async function ExpenseVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile(["admin"]);
  const expense = await getExpense((await params).id).catch(() => null);
  if (!expense) notFound();

  return (
    <main className={styles.documentScreen}>
      <article className={styles.document}>
        <header className={styles.letterhead}>
          <img className={styles.seal} src="/murshida-manzil/murshida-seal.png" alt="Murshida Manzil official seal" />
          <img className={styles.architecture} src="/murshida-manzil/murshida-architecture.png" alt="Murshida Manzil architectural artwork" />
          <div className={styles.brand}>
            <h1>মুর্শিদা মঞ্জিল</h1>
            <h2>খরচের ভাউচার</h2>
            <p>EXPENSE VOUCHER</p>
          </div>
          <div className={styles.generated}><span>Voucher / Reference No.</span><strong>{expense.voucher_number ?? expense.id}</strong></div>
        </header>

        <div className={styles.content}>
          <div className={styles.voucherMeta}>
            <div className={styles.metaCard}><span>Voucher Number</span><strong>{expense.voucher_number ?? expense.id}</strong></div>
            <div className={styles.metaCard}><span>Date</span><strong>{String(expense.expense_date)}</strong></div>
          </div>

          <h2 className={styles.sectionTitle}>Expense particulars · খরচের বিবরণ</h2>
          <dl className={styles.voucherDetails}>
            <div className={styles.detailCard}><dt>Expense Category</dt><dd>{expense.category ?? "—"}</dd></div>
            <div className={styles.detailCard}><dt>Paid To</dt><dd>{expense.paid_to ?? "—"}</dd></div>
            <div className={styles.detailCard}><dt>Payment Method</dt><dd>{expense.payment_method ?? "—"}</dd></div>
            <div className={`${styles.detailCard} ${styles.detailCardWide}`}><dt>Purpose / Description</dt><dd>{expense.description}</dd></div>
            <div className={`${styles.detailCard} ${styles.detailCardFull}`}><dt>Notes</dt><dd>{expense.notes ?? "—"}</dd></div>
          </dl>

          <table className={styles.amountTable}>
            <thead><tr><th>Particulars</th><th>Amount (৳)</th></tr></thead>
            <tbody><tr><td>{expense.description}</td><td>{String(expense.amount)}</td></tr></tbody>
            <tfoot><tr><td>Total Amount</td><td>{String(expense.amount)}</td></tr></tfoot>
          </table>

          <div className={styles.signatures}>
            <div className={styles.signature}>প্রস্তুতকারী<small>Prepared By</small></div>
            <div className={styles.signature}>অনুমোদনকারী<small>Approved By</small></div>
            <div className={styles.signature}>গ্রহণকারী<small>Receiver</small></div>
            <img className={styles.signatureSeal} src="/murshida-manzil/murshida-seal.png" alt="Murshida Manzil official seal" />
          </div>
        </div>
        <footer className={styles.footer}>মুর্শিদা মঞ্জিল · Expense Voucher · Property administration</footer>
        <div className={styles.printAction}><PrintButton /></div>
      </article>
    </main>
  );
}
