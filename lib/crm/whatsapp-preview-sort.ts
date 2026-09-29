export type WhatsappPreviewSortKey = "last_communication_at" | "next_follow_up_at";
export type WhatsappPreviewSortDirection = "asc" | "desc";

type SortableWhatsappRow = Record<WhatsappPreviewSortKey, string> & { customer_id: string };

export function sortWhatsappPreviewRows<T extends SortableWhatsappRow>(
  rows: readonly T[],
  key: WhatsappPreviewSortKey,
  direction: WhatsappPreviewSortDirection,
) {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left[key]);
    const rightTime = Date.parse(right[key]);
    const leftMissing = Number.isNaN(leftTime);
    const rightMissing = Number.isNaN(rightTime);
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? left.customer_id.localeCompare(right.customer_id) : leftMissing ? 1 : -1;
    return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
  });
}
