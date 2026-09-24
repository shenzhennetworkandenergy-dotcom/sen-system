import { buildAdvanceMoneyReceiptData, buildRentReceiptData } from "@/lib/murshida-manzil/receipts";
import { PrintButton } from "./PrintButton";
import styles from "../murshida.module.css";

const cx = (...names: string[]) => names.map((name) => styles[name]).join(" ");

type RentReceipt = ReturnType<typeof buildRentReceiptData>;
type AdvanceReceipt = ReturnType<typeof buildAdvanceMoneyReceiptData>;

function CopyBrand({ receipt, kind }: { receipt: RentReceipt | AdvanceReceipt; kind: "rent" | "advance" }) {
  return <><div className={styles.copyLabel}>বাড়িওয়ালার কপি · LANDLORD COPY</div><div className={styles.brand}><img className={styles.architecture} src="/murshida-manzil/murshida-architecture.png" alt="Murshida Manzil architectural artwork" /><div className={styles.brandText}><strong>{receipt.headingEnglish}</strong><small>{receipt.headingBangla}</small><span>{kind === "rent" ? "ভাড়া রসিদ · RENT RECEIPT" : "অ্যাডভান্স রসিদ · ADVANCE RECEIPT"}</span></div><img className={styles.seal} src="/murshida-manzil/murshida-seal.png" alt="Murshida Manzil official seal" /></div></>;
}

function RentCopy({ receipt, tenant }: { receipt: RentReceipt; tenant: "LANDLORD COPY" | "TENANT COPY" }) {
  return <section className={styles.copy}><CopyBrand receipt={receipt} kind="rent" /><p className={styles.title}>{tenant === "LANDLORD COPY" ? "LANDLORD COPY" : "ভাড়াটিয়ার কপি · TENANT COPY"}</p><div className={styles.meta}><p><b>Receipt no:</b> {receipt.receiptNumber}</p><p><b>Date:</b> {receipt.date}</p><p><b>Tenant:</b> {receipt.tenantName}</p><p><b>Mobile:</b> {receipt.tenantPhone ?? "—"}</p><p><b>Unit / Flat:</b> {receipt.unitSnapshot}</p><p><b>Rent period:</b> {receipt.rentMonth}/{receipt.rentYear}</p><p><b>Payment:</b> {receipt.paymentMethod}</p></div><div className={styles.amounts}><p><span>Monthly rent</span><span>{receipt.monthlyRent}</span></p><p><span>Advance adjusted</span><span>{receipt.advanceAdjusted}</span></p><p><span>Cash received</span><span>{receipt.actualMoneyReceived}</span></p><p><span>Rent settled</span><span>{receipt.totalRentSettled}</span></p><p><span>Balance before</span><span>{receipt.advanceBalanceBefore}</span></p><p><span>Balance remaining</span><span>{receipt.advanceBalanceAfter}</span></p></div><div className={styles.signatures}><div className={styles.signatureLine}>গ্রহণকারীর স্বাক্ষর · Receiver / Collector</div><div className={styles.signatureLine}>মালিকের স্বাক্ষর · Owner / Authorized</div></div></section>;
}

function AdvanceCopy({ receipt, tenant }: { receipt: AdvanceReceipt; tenant: "LANDLORD COPY" | "TENANT COPY" }) {
  return <section className={styles.copy}><CopyBrand receipt={receipt} kind="advance" /><p className={styles.title}>{tenant === "LANDLORD COPY" ? "LANDLORD COPY" : "ভাড়াটিয়ার কপি · TENANT COPY"}</p><div className={styles.meta}><p><b>Receipt no:</b> {receipt.receiptNumber}</p><p><b>Date:</b> {receipt.date}</p><p><b>Tenant:</b> {receipt.tenantName}</p><p><b>Mobile:</b> {receipt.tenantPhone ?? "—"}</p><p><b>Unit / Flat:</b> {receipt.unitSnapshot}</p></div><div className={styles.amounts}><p><span>Advance received</span><span>{receipt.amount}</span></p><p><span>Default monthly deduction</span><span>{receipt.defaultMonthlyAdjustment}</span></p><p><span>Status</span><span>Not rent income</span></p></div><div className={styles.signatures}><div className={styles.signatureLine}>গ্রহণকারীর স্বাক্ষর · Receiver / Collector</div><div className={styles.signatureLine}>মালিকের স্বাক্ষর · Owner / Authorized</div></div></section>;
}

export function MurshidaReceiptDocument({ receipt, kind }: { receipt: RentReceipt | AdvanceReceipt; kind: "rent" | "advance" }) {
  return <main className={cx("receiptScreen", kind === "rent" ? "rentTheme" : "advanceTheme")}><div className={styles.receiptToolbar}><span className={styles.screenNote}>11 × 4.5 inch landscape receipt preview</span><PrintButton /></div><article className={cx("receiptDocument", `murshida-receipt--${kind}`)}>{kind === "rent" ? <><RentCopy receipt={receipt as RentReceipt} tenant="LANDLORD COPY" /><div className={styles.cutLine} aria-hidden="true" /><RentCopy receipt={receipt as RentReceipt} tenant="TENANT COPY" /></> : <><AdvanceCopy receipt={receipt as AdvanceReceipt} tenant="LANDLORD COPY" /><div className={styles.cutLine} aria-hidden="true" /><AdvanceCopy receipt={receipt as AdvanceReceipt} tenant="TENANT COPY" /></>}</article></main>;
}
