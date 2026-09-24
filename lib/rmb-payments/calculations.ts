export function calculateRmbEstimate(
  foreignAmount: number,
  agreedRate: number,
  servicePercentage: number | null,
) {
  const baseAmount = Number.isFinite(foreignAmount) && foreignAmount > 0 ? foreignAmount : 0;
  const percentage = Number.isFinite(servicePercentage) && (servicePercentage ?? 0) > 0
    ? servicePercentage ?? 0
    : 0;
  const serviceAmount = baseAmount * percentage / 100;
  const adjustedAmount = baseAmount + serviceAmount;
  const payable = adjustedAmount > 0 && Number.isFinite(agreedRate) && agreedRate > 0
    ? Math.round(adjustedAmount * agreedRate * 100) / 100
    : 0;
  return { baseAmount, serviceAmount, adjustedAmount, payable };
}
