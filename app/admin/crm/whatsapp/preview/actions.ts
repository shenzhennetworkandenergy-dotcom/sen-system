"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { createWhatsappCategoryCsv } from "@/lib/crm/whatsapp-category-store";
import type { WhatsappSheetSavePayload } from "@/lib/crm/whatsapp-sheet-model";
import {
  finishWhatsappSheetEdit,
  restorePreviousWhatsappSheet,
  saveWhatsappSheet,
  startWhatsappSheetEdit,
} from "@/lib/crm/whatsapp-sheet-store";

const previewPath = "/admin/crm/whatsapp/preview";

async function requireWhatsappSheetAdmin() {
  const { profile } = await requirePermission("crm.edit");
  if (profile.role !== "admin") throw new Error("Administrator access is required.");
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to update the spreadsheet.";
  return { ok: false as const, error: message };
}

export async function startWhatsappSheetEditAction(categorySlug: string) {
  try {
    await requireWhatsappSheetAdmin();
    const state = await startWhatsappSheetEdit(categorySlug);
    revalidatePath(previewPath);
    return { ok: true as const, state };
  } catch (error) {
    return failure(error);
  }
}

export async function saveWhatsappSheetAction(payload: WhatsappSheetSavePayload) {
  try {
    await requireWhatsappSheetAdmin();
    const state = await saveWhatsappSheet(payload);
    revalidatePath(previewPath);
    return { ok: true as const, state };
  } catch (error) {
    return failure(error);
  }
}

export async function finishWhatsappSheetEditAction(categorySlug: string, sessionId: string) {
  try {
    await requireWhatsappSheetAdmin();
    const state = await finishWhatsappSheetEdit(categorySlug, sessionId);
    revalidatePath(previewPath);
    return { ok: true as const, state };
  } catch (error) {
    return failure(error);
  }
}

export async function restorePreviousWhatsappSheetAction(categorySlug: string) {
  try {
    await requireWhatsappSheetAdmin();
    const state = await restorePreviousWhatsappSheet(categorySlug);
    revalidatePath(previewPath);
    return { ok: true as const, state };
  } catch (error) {
    return failure(error);
  }
}

export async function createWhatsappCategoryCsvAction(formData: FormData) {
  try {
    await requireWhatsappSheetAdmin();
    const category = await createWhatsappCategoryCsv(String(formData.get("name") ?? ""));
    revalidatePath(previewPath);
    return { ok: true as const, category };
  } catch (error) {
    return failure(error);
  }
}
