/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSerialLabelAssets } from "@/lib/inventory/labels";
import { canEmployeePrintPurchaseSerial, mustScopeSerialPrintToEmployeePurchaseReceipt } from "@/lib/inventory/employee-stock-receiving";
import { PrintButton } from "@/components/inventory/PrintButton";

export const dynamic="force-dynamic";
export default async function SerialPrintPage({searchParams}:{searchParams:Promise<{ids?:string;batch?:string;preset?:string}>}){
  const {profile,permissions}=await requireAnyPermission(["serials.print","inventory.receive_new_stock"]); const scopedEmployeeReceiptPrint=mustScopeSerialPrintToEmployeePurchaseReceipt({role:profile.role,hasGlobalSerialPrintPermission:permissions.has("serials.print")}); const backHref=scopedEmployeeReceiptPrint?"/employee/inventory/receive":"/admin/serials"; const params=await searchParams; const ids=(params.ids??"").split(",").filter((id)=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,500); const db=createSupabaseAdminClient();
  let query=db.from("serial_numbers").select("id,sen_serial,manufacturer_serial,status,condition,product_id,purchase_order_item_id,products(name,model_number,brands(name))").not("sen_serial","is",null).limit(500);
  if(params.batch)query=query.eq("generation_batch_id",params.batch);else if(ids.length)query=query.in("id",ids);else return <main className="p-8"><h1 className="text-2xl font-bold">No serials selected</h1><a href={backHref}>Return</a></main>;
  const{data,error}=await query.order("created_at");if(error)throw new Error("Unable to load printable serials.");
  if(scopedEmployeeReceiptPrint) {
    const units=data??[];
    const itemIds=units.map((unit)=>unit.purchase_order_item_id).filter((id):id is string=>Boolean(id));
    const [assignment,items]=await Promise.all([
      db.from("profile_warehouse_assignments").select("warehouse_id").eq("profile_id",profile.id).eq("is_primary",true).eq("is_active",true).maybeSingle(),
      itemIds.length?db.from("purchase_order_items").select("id,purchase_orders(status,destination_warehouse_id)").in("id",itemIds):Promise.resolve({data:[],error:null}),
    ]);
    if(assignment.error || items.error) throw new Error("Unable to verify employee serial printing.");
    const orders=new Map((items.data??[]).map((item)=>[item.id,item.purchase_orders as unknown as {status:string;destination_warehouse_id:string}|null]));
    const allowed=units.length>0 && units.every((unit)=>{
      const order=unit.purchase_order_item_id?orders.get(unit.purchase_order_item_id):null;
      return canEmployeePrintPurchaseSerial({assignedWarehouseId:assignment.data?.warehouse_id??null,destinationWarehouseId:order?.destination_warehouse_id??null,orderStatus:order?.status??"",serialStatus:unit.status,purchaseOrderItemId:unit.purchase_order_item_id});
    });
    if(!allowed) redirect("/employee/inventory/receive?error=Only%20expected%20serials%20from%20physically%20arrived%20purchase%20orders%20at%20your%20assigned%20warehouse%20can%20be%20printed.");
  }
  const labels=await Promise.all((data??[]).map(async(unit)=>({...unit,assets:await createSerialLabelAssets(unit.sen_serial!)})));
  const preset=["50x30","60x40","a4"].includes(params.preset??"")?params.preset:"60x40";
  return <main className={`label-print preset-${preset} min-h-screen bg-white p-6 text-black`}><div className="print:hidden mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-3"><a href={backHref} className="rounded border px-4 py-2">Back</a><PrintButton/><span>{labels.length} label(s)</span><a href={`?${params.batch?`batch=${params.batch}`:`ids=${ids.join(",")}`}&preset=50x30`}>50×30</a><a href={`?${params.batch?`batch=${params.batch}`:`ids=${ids.join(",")}`}&preset=60x40`}>60×40</a><a href={`?${params.batch?`batch=${params.batch}`:`ids=${ids.join(",")}`}&preset=a4`}>A4</a></div><div className="label-grid mx-auto">{labels.map((unit)=>{const product=unit.products as unknown as {name:string;model_number:string|null;brands:{name:string}|null};return <article key={unit.id} className="serial-label relative break-inside-avoid border border-black bg-white p-2"><div className="flex items-center justify-between"><Image src="/brand/sen-official-logo.png" alt="SEN" width={50} height={50} className="h-8 w-8 object-contain"/><strong className="text-[10px]">{product?.brands?.name??"SEN"}</strong></div><h2 className="truncate text-[10px] font-bold">{product?.name}</h2><p className="text-[8px]">Model: {product?.model_number??"—"}</p><div className="mt-1" dangerouslySetInnerHTML={{__html:unit.assets.barcodeSvg}}/><p className="break-all text-center font-mono text-[7px] font-bold">{unit.sen_serial}</p><div className="mt-1 flex items-end justify-between gap-1"><img src={unit.assets.qrDataUrl} alt={`QR for ${unit.sen_serial}`} className="h-12 w-12"/><div className="text-right text-[7px]"><p>{unit.manufacturer_serial?`MFR: ${unit.manufacturer_serial}`:"Manufacturer serial not provided"}</p><p>{unit.condition} · {unit.status}</p></div></div></article>})}</div></main>;
}
