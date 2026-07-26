import { quickUpdateProductAction } from "@/app/admin/products/actions";

type ProductQuickEditProps = {
  product: {
    id:string;
    status:string;
    stock_status:string;
    regular_price:number|null;
    sale_price:number|null;
    featured:boolean;
    public_catalogue_visible:boolean;
  };
};

export function ProductQuickEdit({product}:ProductQuickEditProps){
  return <details className="relative">
    <summary className="cursor-pointer font-semibold text-cyan-700">Quick edit</summary>
    <form action={quickUpdateProductAction.bind(null,product.id)} className="absolute right-0 z-20 mt-2 grid w-72 gap-2 rounded-xl border bg-white p-3 text-slate-950 shadow-2xl">
      <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Regular price<input name="regular_price" type="number" min="0" step=".01" defaultValue={product.regular_price??""} className="mt-1 w-full rounded border p-2"/></label><label className="text-xs font-semibold">Sale price<input name="sale_price" type="number" min="0" step=".01" defaultValue={product.sale_price??""} className="mt-1 w-full rounded border p-2"/></label></div>
      <label className="text-xs font-semibold">Status<select name="status" defaultValue={product.status} className="mt-1 w-full rounded border p-2"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <label className="text-xs font-semibold">Stock status<select name="stock_status" defaultValue={product.stock_status} className="mt-1 w-full rounded border p-2"><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="on_backorder">On backorder</option></select></label>
      <label className="text-xs"><input type="checkbox" name="public_catalogue_visible" defaultChecked={product.public_catalogue_visible}/> Public catalogue</label>
      <label className="text-xs"><input type="checkbox" name="featured" defaultChecked={product.featured}/> Featured</label>
      <button className="rounded-lg bg-cyan-700 px-3 py-2 font-bold text-white">Save quick changes</button>
    </form>
  </details>;
}
