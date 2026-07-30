"use client";

import { useMemo, useState } from "react";

import { createSaleAction } from "@/app/admin/sales/actions";
import {
  SaleProductPicker,
  type SalePickerProduct,
} from "@/components/sales/SaleProductPicker";
import { roundMoney } from "@/lib/validation/numbers";

type Customer = { id:string; full_name:string|null; email:string; phone:string|null; company_name:string|null };
type Product = SalePickerProduct;
type Variation = { id:string; product_id:string; name:string|null; sku:string; regular_price:number|null; sale_price:number|null };
type Balance = { product_id:string; variation_id:string|null; warehouse_id:string; available:number };
type Address = { id:string; profile_id:string; recipient_name:string; address_line_1:string; city:string; country_code:string; is_default_shipping:boolean };
type Warehouse = { id:string; code:string; name:string };
type Row = { key:string; product_id:string; variation_id:string; quantity:string; unit_price:string; line_discount:string; discount_percent:string; reason:string; catalogue_price:number };

const field = "mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2";
const customerLabel = (customer: Customer) => `${customer.full_name || customer.email} · ${customer.email}`;

export function SaleBuilder({
  customers, products, variations, balances, warehouses, addresses,
}: {
  customers:Customer[]; products:Product[]; variations:Variation[]; balances:Balance[]; warehouses:Warehouse[]; addresses:Address[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [addressId, setAddressId] = useState("");
  const [rows, setRows] = useState<Row[]>([{
    key: crypto.randomUUID(), product_id:"", variation_id:"", quantity:"1", unit_price:"0",
    line_discount:"0", discount_percent:"0", reason:"", catalogue_price:0,
  }]);

  const customer = customers.find((item) => item.id === customerId);
  const customerAddresses = addresses.filter((item) => item.profile_id === customerId);
  const customerChoices = customers.filter((item) =>
    `${item.full_name ?? ""} ${item.email} ${item.phone ?? ""} ${item.company_name ?? ""}`.toLowerCase().includes(customerSearch.toLowerCase()),
  ).slice(0, 20);
  const selected = useMemo(() => rows.map((row) => {
    const product = products.find((item) => item.id === row.product_id);
    const variation = variations.find((item) => item.id === row.variation_id);
    const available = balances
      .filter((item) => item.product_id === row.product_id && item.warehouse_id === warehouseId && (!row.variation_id || item.variation_id === row.variation_id))
      .reduce((total, item) => total + Number(item.available), 0);
    const gross = Number(row.quantity || 0) * Number(row.unit_price || 0);
    const discount = Math.min(gross, Number(row.line_discount || 0) + gross * Number(row.discount_percent || 0) / 100);
    return { ...row, product, variation, available, gross, discount, lineTotal:gross-discount };
  }), [rows, products, variations, balances, warehouseId]);

  const update = (key:string, patch:Partial<Row>) =>
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const payload = selected.filter((item) => item.product).map((item) => ({
    product_id:item.product_id, variation_id:item.variation_id || null, warehouse_id:warehouseId,
    quantity:Number(item.quantity), unit_price:Number(item.unit_price), line_discount:item.discount, line_tax:0,
    price_overridden:Number(item.unit_price) !== item.catalogue_price, catalogue_price:item.catalogue_price,
    adjustment_reason:item.reason,
  }));
  const subtotal = selected.reduce((total, item) => total + item.lineTotal, 0);

  return <form action={createSaleAction} className="space-y-4">
    <input type="hidden" name="items" value={JSON.stringify(payload)}/>
    <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-4 lg:grid-cols-3">
      <div className="relative text-sm font-semibold">
        Customer
        <input type="hidden" name="customer_id" value={customerId}/>
        <input
          value={customerSearch}
          onChange={(event) => { setCustomerSearch(event.target.value); setCustomerId(""); setAddressId(""); }}
          placeholder="Type a name, email, phone or company"
          className={field}
          autoComplete="off"
          required
        />
        {customerSearch && !customerId ? <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl">
          {customerChoices.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => {
              setCustomerId(item.id);
              setCustomerSearch(customerLabel(item));
              setAddressId(addresses.find((address) => address.profile_id === item.id && address.is_default_shipping)?.id ?? "");
            }}
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
          >
            <b>{item.full_name || item.email}</b>
            <span className="block text-xs text-slate-500">{[item.email, item.phone, item.company_name].filter(Boolean).join(" · ")}</span>
          </button>)}
          {!customerChoices.length ? <span className="block px-3 py-2 text-slate-500">No matching customer</span> : null}
        </div> : null}
      </div>
      <label className="text-sm font-semibold">Sales source<select name="sales_source" className={field}>{["website","facebook","whatsapp","phone","email","direct_office","existing_customer","sales_representative","referral","other"].map((item)=><option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm font-semibold">Expected delivery<input name="expected_delivery_date" type="date" className={field}/></label>
      <label className="text-sm font-semibold">Warehouse<select name="warehouse_id" value={warehouseId} onChange={(event)=>setWarehouseId(event.target.value)} className={field} required>{warehouses.map((item)=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Delivery address<select name="address_id" value={addressId} onChange={(event)=>setAddressId(event.target.value)} className={field}><option value="">Enter below</option>{customerAddresses.map((item)=><option key={item.id} value={item.id}>{item.recipient_name}, {item.address_line_1}</option>)}</select></label>
      <label className="text-sm font-semibold">Billing address<select name="billing_address_id" className={field}><option value="">Same as delivery</option>{customerAddresses.map((item)=><option key={item.id} value={item.id}>{item.recipient_name}, {item.address_line_1}</option>)}</select></label>
      {!addressId ? <>
        <input key={`${customerId}:name`} name="recipient_name" placeholder="Recipient name" defaultValue={customer?.full_name ?? ""} className={field} required/>
        <input key={`${customerId}:phone`} name="phone" placeholder="Phone" defaultValue={customer?.phone ?? ""} className={field} required/>
        <input name="address_line_1" placeholder="Delivery address" className={field} required/>
        <input name="city" placeholder="City" className={field} required/>
        <input name="country_code" defaultValue="BD" maxLength={2} className={field} required/>
      </> : null}
    </section>

    <section className="rounded-xl border bg-[var(--surface)] p-4">
      <div><h2 className="font-bold">Products and pricing</h2><p className="text-sm text-[var(--muted-text)]">Search by product name, model or SKU. Product details and price fill automatically.</p></div>
      <div className="mt-3 space-y-3">{selected.map((row)=><article key={row.key} className="grid gap-2 rounded-xl border p-3 lg:grid-cols-[2fr_1fr_.6fr_.8fr_.7fr_.7fr_auto]">
        <SaleProductPicker
          products={products}
          selectedProduct={row.product}
          onClear={() => update(row.key, { product_id:"", variation_id:"", unit_price:"0", catalogue_price:0 })}
          onSelect={(product) => {
            const price = Math.round(Number(product.sale_price ?? product.regular_price ?? 0) * 100) / 100;
            update(row.key, { product_id:product.id, variation_id:"", unit_price:String(price), catalogue_price:price });
          }}
        />
        <label className="text-xs font-semibold">Variation<select value={row.variation_id} onChange={(event)=>{const variation=variations.find((item)=>item.id===event.target.value),price=Math.round(Number(variation?.sale_price??variation?.regular_price??row.catalogue_price)*100)/100;update(row.key,{variation_id:event.target.value,unit_price:String(price),catalogue_price:price})}} className={field}><option value="">None</option>{variations.filter((item)=>item.product_id===row.product_id).map((item)=><option key={item.id} value={item.id}>{item.name||item.sku}</option>)}</select></label>
        <label className="text-xs font-semibold">Qty<input type="number" min="1" max={row.available} step="1" value={row.quantity} onChange={(event)=>update(row.key,{quantity:String(Math.max(1,Math.trunc(Number(event.target.value)||1)))})} className={field}/><span className={Number(row.quantity)>row.available?"text-red-700":"text-[var(--muted-text)]"}>Available {row.available}</span></label>
        <label className="text-xs font-semibold">Unit BDT<input type="number" inputMode="decimal" min="0" step=".01" value={row.unit_price} onChange={(event)=>update(row.key,{unit_price:event.target.value})} onBlur={()=>update(row.key,{unit_price:String(roundMoney(Number(row.unit_price)||0))})} className={field}/></label>
        <label className="text-xs font-semibold">Discount %<input type="number" inputMode="decimal" min="0" max="100" step=".01" value={row.discount_percent} onChange={(event)=>update(row.key,{discount_percent:event.target.value})} onBlur={()=>update(row.key,{discount_percent:String(roundMoney(Number(row.discount_percent)||0))})} className={field}/></label>
        <label className="text-xs font-semibold">Fixed discount<input type="number" inputMode="decimal" min="0" step=".01" value={row.line_discount} onChange={(event)=>update(row.key,{line_discount:event.target.value})} onBlur={()=>update(row.key,{line_discount:String(roundMoney(Number(row.line_discount)||0))})} className={field}/><span>Line {row.lineTotal.toFixed(2)}</span></label>
        <button type="button" disabled={rows.length===1} onClick={()=>setRows((current)=>current.filter((item)=>item.key!==row.key))} className="self-center rounded-lg border px-3 py-2 disabled:opacity-40">Remove</button>
        {(Number(row.unit_price)!==row.catalogue_price||row.discount>0)?<label className="text-xs font-semibold lg:col-span-full">Adjustment reason<input value={row.reason} onChange={(event)=>update(row.key,{reason:event.target.value})} required className={field}/></label>:null}
      </article>)}</div>
      <button type="button" onClick={()=>setRows((current)=>[...current,{key:crypto.randomUUID(),product_id:"",variation_id:"",quantity:"1",unit_price:"0",line_discount:"0",discount_percent:"0",reason:"",catalogue_price:0}])} className="mt-3 rounded-lg border px-4 py-2 font-semibold">+ Add product</button>
    </section>
    <section className="grid gap-3 rounded-xl border bg-[var(--surface)] p-4 md:grid-cols-3"><label className="text-sm">Order discount<input name="discount_amount" type="number" min="0" step=".01" defaultValue="0" className={field}/></label><label className="text-sm">Shipping charge<input name="shipping_amount" type="number" min="0" step=".01" defaultValue="0" className={field}/></label><label className="text-sm">Installation/service<input name="service_amount" type="number" min="0" step=".01" defaultValue="0" className={field}/></label><label className="text-sm">VAT/tax<input name="tax_amount" type="number" min="0" step=".01" defaultValue="0" className={field}/></label><label className="text-sm md:col-span-2">Discount reason<input name="discount_reason" className={field}/></label><label className="text-sm md:col-span-3">Customer note<textarea name="customer_notes" className={field}/></label><label className="text-sm md:col-span-3">Internal note<textarea name="internal_notes" className={field}/></label><div className="md:col-span-3 text-right text-xl font-bold">Items after line discounts: {subtotal.toFixed(2)} BDT</div></section>
    <div className="flex justify-end"><button disabled={!customerId || !payload.length} className="rounded-lg bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50">Create draft sale</button></div>
  </form>;
}
