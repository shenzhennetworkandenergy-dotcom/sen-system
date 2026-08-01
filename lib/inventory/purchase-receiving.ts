export type PendingReceiptQuantity = {
  quantity_ordered:number|string;
  quantity_received:number|string;
  quantity_rejected:number|string;
};

export function remainingPurchaseReceiptUnits(items:PendingReceiptQuantity[]){
  return items.reduce((total,item)=>total+Math.max(0,
    Number(item.quantity_ordered)-Number(item.quantity_received)-Number(item.quantity_rejected),
  ),0);
}
