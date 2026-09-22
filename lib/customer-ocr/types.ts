import type { CustomerSearchOption } from "@/lib/customers/search";

export const businessCardFieldKeys = [
  "companyName",
  "contactName",
  "designation",
  "mobileNumber",
  "alternatePhone",
  "emailAddress",
  "website",
  "fullAddress",
  "city",
  "country",
] as const;

export type BusinessCardFieldKey = (typeof businessCardFieldKeys)[number];
export type OcrFieldStatus = "ok" | "low" | "ambiguous";

export type ReviewedBusinessCardField = {
  value: string;
  confidence: number | null;
  status: OcrFieldStatus;
  sourceText: string;
};

export type ReviewedBusinessCard = Record<
  BusinessCardFieldKey,
  ReviewedBusinessCardField
>;

export type OcrLine = {
  text: string;
  confidence: number;
};

export type OcrProgress = {
  stage: string;
  progress: number;
};

export interface BusinessCardOcrProvider {
  recognize(
    image: Blob,
    options?: { onProgress?: (progress: OcrProgress) => void },
  ): Promise<ReviewedBusinessCard>;
}

export type DuplicateReason = "email" | "phone" | "company";

export type DuplicateCandidate = {
  customer: CustomerSearchOption;
  reasons: DuplicateReason[];
  blocksCreation: boolean;
};
