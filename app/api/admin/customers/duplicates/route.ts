import { requirePermission } from "@/lib/auth/permissions";
import { findPossibleCustomers } from "@/lib/customers/duplicates-server";

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid duplicate-check request." }, { status: 400 });
  }

  const workflow = String(input.workflow ?? "");
  if (workflow !== "sales" && workflow !== "quotations") {
    return Response.json({ error: "Invalid customer workflow." }, { status: 400 });
  }
  await requirePermission(
    workflow === "sales" ? "sales.create" : "quotations.create",
  );
  const duplicates = await findPossibleCustomers({
    email: String(input.email ?? "").trim().slice(0, 320),
    phone: String(input.phone ?? "").trim().slice(0, 50),
    companyName: String(input.companyName ?? "").trim().slice(0, 200),
  });
  return Response.json({ duplicates });
}
