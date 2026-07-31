type CheckoutError = {
  code?: string | null;
  message?: string | null;
};

const expectedCheckoutMessage =
  /stock|address|warehouse|cart|email|phone|payment/i;

export function isExpectedCheckoutRejection(error: CheckoutError | null | undefined) {
  return error?.code === "P0001"
    && expectedCheckoutMessage.test(error.message ?? "");
}

export function checkoutErrorMessage(error: CheckoutError | null | undefined) {
  if (isExpectedCheckoutRejection(error)) {
    return error?.message ?? "Unable to place order.";
  }
  return "Unable to place order. Please verify your information and try again.";
}

