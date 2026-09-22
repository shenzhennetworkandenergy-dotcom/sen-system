import type { DuplicateCandidate } from "@/lib/customer-ocr/types";

export type CustomerCreationDecision = {
  allowCreation: boolean;
  requiresOverride: boolean;
  message: string;
};

export function customerCreationDecision(
  duplicates: DuplicateCandidate[],
  duplicateOverride: boolean,
): CustomerCreationDecision {
  if (!duplicates.length) {
    return { allowCreation: true, requiresOverride: false, message: "" };
  }
  if (duplicates.some((duplicate) => duplicate.blocksCreation)) {
    return {
      allowCreation: false,
      requiresOverride: false,
      message:
        "A customer with this email already exists. Use the existing customer.",
    };
  }
  if (!duplicateOverride) {
    return {
      allowCreation: false,
      requiresOverride: true,
      message: "Possible existing customer found.",
    };
  }
  return { allowCreation: true, requiresOverride: false, message: "" };
}
