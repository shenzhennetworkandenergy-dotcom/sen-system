import type { buildRentReceiptData } from "@/lib/murshida-manzil/receipts";
import { MurshidaReceiptDocument } from "./MurshidaReceiptCopy";

export function RentReceiptDocument({ receipt }: { receipt: ReturnType<typeof buildRentReceiptData> }) {
  // Presentation contract retains print:min-h behavior in the shared document.
  return <MurshidaReceiptDocument receipt={receipt} kind="rent" />;
}
