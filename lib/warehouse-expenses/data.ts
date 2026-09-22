import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WarehouseExpenseTemplate = {
  id: string;
  warehouse_id: string;
  payee_organization: string;
  contact_person: string | null;
  payee_address: string | null;
  payee_phone: string | null;
  default_rent_amount: number;
  warehouses: { id: string; code: string; name: string; address: string | null } | null;
};

export type WarehouseExpenseVoucher = {
  id: string;
  voucher_month: string;
  warehouse_id: string;
  template_id: string | null;
  payee_organization: string;
  contact_person: string | null;
  payee_address: string | null;
  payee_phone: string | null;
  rent_amount: number;
  electricity_amount: number;
  staff_food_amount: number;
  other_amount: number;
  total_amount: number;
  status: "draft" | "paid";
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  created_at: string;
  warehouses: { id: string; code: string; name: string; address: string | null } | null;
};

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getWarehouseExpenseWorkspace(editId?: string) {
  const db = createSupabaseAdminClient();
  const [templateResult, vouchersResult] = await Promise.all([
    db.from("warehouse_expense_templates")
      .select("id,warehouse_id,payee_organization,contact_person,payee_address,payee_phone,default_rent_amount,warehouses(id,code,name,address)")
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    db.from("warehouse_expense_vouchers")
      .select("id,voucher_month,warehouse_id,template_id,payee_organization,contact_person,payee_address,payee_phone,rent_amount,electricity_amount,staff_food_amount,other_amount,total_amount,status,payment_date,payment_method,payment_reference,note,created_at,warehouses(id,code,name,address)")
      .order("voucher_month", { ascending: false }),
  ]);
  if (templateResult.error || vouchersResult.error) throw new Error("Unable to load warehouse expense vouchers.");
  const vouchers = (vouchersResult.data ?? []).map((row) => ({ ...row, warehouses: relation(row.warehouses) })) as WarehouseExpenseVoucher[];
  const template = templateResult.data
    ? ({ ...templateResult.data, warehouses: relation(templateResult.data.warehouses) } as WarehouseExpenseTemplate)
    : null;
  return { template, vouchers, editing: vouchers.find((row) => row.id === editId) ?? null };
}

export async function getWarehouseExpenseVoucher(id: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("warehouse_expense_vouchers")
    .select("id,voucher_month,warehouse_id,template_id,payee_organization,contact_person,payee_address,payee_phone,rent_amount,electricity_amount,staff_food_amount,other_amount,total_amount,status,payment_date,payment_method,payment_reference,note,created_at,warehouses(id,code,name,address)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load warehouse expense voucher.");
  return data ? ({ ...data, warehouses: relation(data.warehouses) } as WarehouseExpenseVoucher) : null;
}
