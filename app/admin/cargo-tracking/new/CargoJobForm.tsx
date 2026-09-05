"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  createCargoJobAction,
  type CargoJobFormState,
  type CargoJobFormValues,
} from "../actions";

const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2";

type CustomerOption = { id: string; full_name: string | null; company_name: string | null; email: string };
type WarehouseOption = { id: string; code: string; name: string };
type CarrierOption = { id: string; name: string };

type Props = {
  customers: CustomerOption[];
  chinaWarehouses: WarehouseOption[];
  bangladeshWarehouses: WarehouseOption[];
  carriers: CarrierOption[];
  packageUnits: readonly string[];
  initialCustomerId?: string;
  initialCarrierName?: string;
};

function initialValues(initialCustomerId = "", initialCarrierName = ""): CargoJobFormValues {
  return {
    customer_id: initialCustomerId,
    courier_tracking_number: "",
    goods_summary: "",
    shipping_method: "air",
    carrier_name: initialCarrierName,
    carrier_reference: "",
    charge_basis: "per_kg",
    rate: "0",
    china_warehouse_id: "",
    bangladesh_warehouse_id: "",
    note: "",
    packages: Array.from({ length: 5 }, (_, index) => ({
      description: "",
      quantity: index === 0 ? "1" : "",
      unit: index === 0 ? "Piece" : "",
      weight: "",
      dimensions: "",
      cbm: "",
    })),
  };
}

export function CargoJobForm({
  customers,
  chinaWarehouses,
  bangladeshWarehouses,
  carriers,
  packageUnits,
  initialCustomerId,
  initialCarrierName,
}: Props) {
  const initial = initialValues(initialCustomerId, initialCarrierName);
  const [state, formAction, pending] = useActionState<CargoJobFormState, FormData>(createCargoJobAction, {
    error: null,
    values: initial,
  });
  const [values, setValues] = useState(initial);

  useEffect(() => {
    if (state.error) setValues(state.values);
  }, [state]);

  const setField = <K extends keyof Omit<CargoJobFormValues, "packages">>(key: K, next: CargoJobFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: next }));
  };
  const setPackageField = (index: number, key: keyof CargoJobFormValues["packages"][number], next: string) => {
    setValues((current) => ({
      ...current,
      packages: current.packages.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item),
    }));
  };

  return <form action={formAction} className="space-y-5 rounded-xl border bg-[var(--surface)] p-5">
    {state.error ? <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{state.error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="font-semibold">Customer<select name="customer_id" required value={values.customer_id} onChange={(event) => setField("customer_id", event.target.value)} className={field}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.company_name || customer.email}</option>)}</select></label>
      <label className="font-semibold">China courier tracking no.<input name="courier_tracking_number" required maxLength={160} value={values.courier_tracking_number} onChange={(event) => setField("courier_tracking_number", event.target.value)} className={field} /></label>
      <label className="font-semibold md:col-span-2">Goods description<textarea name="goods_summary" required maxLength={2000} rows={2} value={values.goods_summary} onChange={(event) => setField("goods_summary", event.target.value)} className={field} /></label>
      <label className="font-semibold">Shipping method<select name="shipping_method" value={values.shipping_method} onChange={(event) => setField("shipping_method", event.target.value)} className={field}><option value="air">Air</option><option value="sea">Sea</option><option value="hand_carry">Hand Carry</option></select></label>
      <label className="font-semibold">Carrier / Transport Provider<input name="carrier_name" list="cargo-carriers" value={values.carrier_name} onChange={(event) => setField("carrier_name", event.target.value)} placeholder="Search or select an active carrier" className={field} /><datalist id="cargo-carriers">{carriers.map((carrier) => <option key={carrier.id} value={carrier.name} />)}</datalist></label>
      <label className="font-semibold md:col-span-2">Carrier Reference / AWB / Booking / Hand Carry Reference<input name="carrier_reference" maxLength={200} value={values.carrier_reference} onChange={(event) => setField("carrier_reference", event.target.value)} className={field} /></label>
      <label className="font-semibold">Charge basis<select name="charge_basis" value={values.charge_basis} onChange={(event) => setField("charge_basis", event.target.value)} className={field}><option value="per_kg">Per kg</option><option value="per_piece">Per piece</option><option value="per_cbm">Per CBM</option><option value="per_ton">Per ton</option><option value="flat">Flat charge</option></select></label>
      <label className="font-semibold">Rate<input name="rate" type="number" min="0" step="0.01" value={values.rate} onChange={(event) => setField("rate", event.target.value)} className={field} /></label>
      <label className="font-semibold">China warehouse<select name="china_warehouse_id" value={values.china_warehouse_id} onChange={(event) => setField("china_warehouse_id", event.target.value)} className={field}><option value="">Not assigned</option>{chinaWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label>
      <label className="font-semibold">Bangladesh warehouse<select name="bangladesh_warehouse_id" value={values.bangladesh_warehouse_id} onChange={(event) => setField("bangladesh_warehouse_id", event.target.value)} className={field}><option value="">Assign later</option>{bangladeshWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label>
      <label className="font-semibold md:col-span-2">Internal note<textarea name="note" maxLength={3000} rows={2} value={values.note} onChange={(event) => setField("note", event.target.value)} className={field} /></label>
    </div>
    <section><h2 className="mb-2 text-lg font-bold">Packages</h2><p className="mb-3 text-sm text-[var(--muted-text)]">Complete one or more rows. The first package is required.</p><div className="space-y-3">
      {values.packages.map((cargoPackage, index) => {
        const active = index === 0 || Boolean(cargoPackage.description || cargoPackage.quantity || cargoPackage.unit || cargoPackage.weight || cargoPackage.dimensions || cargoPackage.cbm);
        return <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-6">
          <input name={`package_${index}_description`} required={index === 0} value={cargoPackage.description} onChange={(event) => setPackageField(index, "description", event.target.value)} placeholder={`Package ${index + 1} description`} className="rounded border px-2 py-2 md:col-span-2" />
          <input name={`package_${index}_quantity`} required={index === 0} type="number" min="0.001" step="0.001" value={cargoPackage.quantity} onChange={(event) => setPackageField(index, "quantity", event.target.value)} placeholder="Quantity" className="rounded border px-2 py-2" />
          <select name={`package_${index}_unit`} required={active} value={cargoPackage.unit} onChange={(event) => setPackageField(index, "unit", event.target.value)} className="rounded border bg-white px-2 py-2"><option value="">Select unit</option>{packageUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
          <input name={`package_${index}_weight`} type="number" min="0" step="0.001" value={cargoPackage.weight} onChange={(event) => setPackageField(index, "weight", event.target.value)} placeholder="Weight kg" className="rounded border px-2 py-2" />
          <input name={`package_${index}_cbm`} type="number" min="0" step="0.0001" value={cargoPackage.cbm} onChange={(event) => setPackageField(index, "cbm", event.target.value)} placeholder="CBM" className="rounded border px-2 py-2" />
          <input name={`package_${index}_dimensions`} value={cargoPackage.dimensions} onChange={(event) => setPackageField(index, "dimensions", event.target.value)} placeholder="Dimensions" className="rounded border px-2 py-2 md:col-span-6" />
        </div>;
      })}
    </div></section>
    <div className="flex gap-3"><button disabled={pending} className="rounded-lg bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:opacity-60">{pending ? "Creating…" : "Create Cargo Job"}</button><Link href="/admin/cargo-tracking" className="rounded-lg border px-5 py-3 font-semibold">Cancel</Link></div>
  </form>;
}

export function WarehouseLocationFields({
  warehouses,
  locations,
  initialWarehouseId = "",
  initialLocationId = "",
}: {
  warehouses: WarehouseOption[];
  locations: Array<{ id: string; warehouse_id: string; code: string; name: string }>;
  initialWarehouseId?: string;
  initialLocationId?: string;
}) {
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [locationId, setLocationId] = useState(
    locations.some((location) => location.id === initialLocationId && location.warehouse_id === initialWarehouseId) ? initialLocationId : "",
  );
  const availableLocations = locations.filter((location) => location.warehouse_id === warehouseId);

  return <>
    <label className="block font-semibold">Bangladesh warehouse<select name="warehouse_id" required value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setLocationId(""); }} className={field}><option value="">Select warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label>
    <label className="block font-semibold">Warehouse/rack location<select name="location_id" value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={!warehouseId} className={field}><option value="">No location</option>{availableLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label>
  </>;
}
