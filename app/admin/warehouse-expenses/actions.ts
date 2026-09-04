"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullable = (form: FormData, key: string) => text(form, key) || null;
const amount = (form: FormData, key: string) => {
  const value = Number(text(form, key) || 0);
  if (!Number.isFinite(value) || value < 0) throw new Error("Expense amounts must be zero or greater.");
  return Math.round(value * 100) / 100;
};

function finish(kind: "success" | "error", message: string) {
  revalidatePath("/admin/warehouse-expenses");
  redirect(`/admin/warehouse-expenses?${kind}=${encodeURIComponent(message)}`);
}

export async function saveWarehouseExpenseVoucherAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  try {
    const id = nullable(form, "voucher_id");
    const warehouseId = text(form, "warehouse_id");
    const month = text(form, "voucher_month");
    if (!warehouseId || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a valid warehouse and voucher month.");
    const db = createSupabaseAdminClient();
    const { data: template, error: templateError } = await db.from("warehouse_expense_templates")
      .select("id,payee_organization,contact_person,payee_address,payee_phone")
      .eq("warehouse_id", warehouseId).eq("is_active", true).maybeSingle();
    if (templateError || !template) throw new Error("The Dhaka warehouse expense template is not available.");
    const payload = {
      voucher_month: `${month}-01`, warehouse_id: warehouseId, template_id: template.id,
      payee_organization: template.payee_organization, contact_person: template.contact_person,
      payee_address: template.payee_address, payee_phone: template.payee_phone,
      rent_amount: amount(form, "rent_amount"), electricity_amount: amount(form, "electricity_amount"),
      staff_food_amount: amount(form, "staff_food_amount"), other_amount: amount(form, "other_amount"),
      status: text(form, "status") === "paid" ? "paid" : "draft",
      payment_date: nullable(form, "payment_date"), payment_method: nullable(form, "payment_method"),
      payment_reference: nullable(form, "payment_reference"), note: nullable(form, "note"),
      updated_by: profile.id, updated_at: new Date().toISOString(),
    };
    const result = id
      ? await db.from("warehouse_expense_vouchers").update(payload).eq("id", id).select("id").single()
      : await db.from("warehouse_expense_vouchers").insert({ ...payload, created_by: profile.id }).select("id").single();
    if (result.error) {
      if (result.error.code === "23505") throw new Error("A voucher already exists for this warehouse and month.");
      throw new Error("Unable to save the warehouse expense voucher.");
    }
    await db.from("audit_logs").insert({
      actor_id: profile.id, actor_role: "admin", action: id ? "warehouse_expense.updated" : "warehouse_expense.created",
      module: "warehouse_expenses", entity_type: "warehouse_expense_voucher", entity_id: String(result.data.id),
      description: `${id ? "Updated" : "Created"} warehouse expense voucher for ${month}.`,
    });
  } catch (error) {
    finish("error", error instanceof Error ? error.message : "Unable to save the warehouse expense voucher.");
  }
  finish("success", "Warehouse expense voucher saved.");
}
