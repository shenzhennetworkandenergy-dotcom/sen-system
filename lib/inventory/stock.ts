export type StockStatus="in_stock"|"low_stock"|"out_of_stock"|"on_backorder";
export function deriveStockStatus(available:number,threshold:number,allowBackorders=false):StockStatus{if(available<=0)return allowBackorders?"on_backorder":"out_of_stock";if(available<=threshold)return"low_stock";return"in_stock";}
export function quantity(value:unknown){const number=Number(value??0);return Number.isFinite(number)?number:0;}
