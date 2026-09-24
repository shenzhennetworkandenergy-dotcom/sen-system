import type { CustomerFormValues } from "@/lib/customer-ocr/apply";
import type { DuplicateCandidate } from "@/lib/customer-ocr/types";

export type CustomerFormState = {
  values: CustomerFormValues;
  duplicates: DuplicateCandidate[];
  duplicateOverride: boolean;
};

export type CustomerFormEvent =
  | {
      type: "field-changed";
      field: keyof CustomerFormValues;
      value: string;
    }
  | { type: "values-replaced"; values: CustomerFormValues }
  | { type: "duplicates-found"; duplicates: DuplicateCandidate[] }
  | { type: "duplicate-override-changed"; value: boolean }
  | { type: "customer-saved" };

export function createInitialCustomerFormState(): CustomerFormState {
  return {
    values: {
      fullName: "",
      companyName: "",
      email: "",
      phone: "",
      alternatePhone: "",
      addressLine1: "",
      city: "Not specified",
      country: "Bangladesh",
      countryCode: "BD",
    },
    duplicates: [],
    duplicateOverride: false,
  };
}

export function customerFormReducer(
  state: CustomerFormState,
  event: CustomerFormEvent,
): CustomerFormState {
  switch (event.type) {
    case "field-changed":
      return {
        values: { ...state.values, [event.field]: event.value },
        duplicates: [],
        duplicateOverride: false,
      };
    case "values-replaced":
      return {
        values: event.values,
        duplicates: [],
        duplicateOverride: false,
      };
    case "duplicates-found":
      return {
        ...state,
        duplicates: event.duplicates,
        duplicateOverride: false,
      };
    case "duplicate-override-changed":
      return {
        ...state,
        duplicateOverride:
          event.value &&
          state.duplicates.length > 0 &&
          !state.duplicates.some((duplicate) => duplicate.blocksCreation),
      };
    case "customer-saved":
      return createInitialCustomerFormState();
  }
}
