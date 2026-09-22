import type { buildAdvanceMoneyReceiptData } from "@/lib/murshida-manzil/receipts";
import { MurshidaReceiptDocument } from "./MurshidaReceiptCopy";

export function AdvanceMoneyReceiptDocument({ receipt }: { receipt: ReturnType<typeof buildAdvanceMoneyReceiptData> }) {
  // Presentation contract retains print:min-h behavior in the shared document.
  return <MurshidaReceiptDocument receipt={receipt} kind="advance" />;
}
