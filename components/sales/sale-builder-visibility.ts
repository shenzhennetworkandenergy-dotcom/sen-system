export type CreateSaleFieldVisibility = {
  deliveryDetails: boolean;
  variation: boolean;
  lineDiscounts: boolean;
  orderAdjustments: boolean;
};

export function createSaleFieldVisibility(role: string): CreateSaleFieldVisibility {
  const showAdminFields = role === "admin";

  return {
    deliveryDetails: showAdminFields,
    variation: showAdminFields,
    lineDiscounts: showAdminFields,
    orderAdjustments: showAdminFields,
  };
}
