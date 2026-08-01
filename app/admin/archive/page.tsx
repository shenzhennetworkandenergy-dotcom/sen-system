import { redirect } from "next/navigation";
import { routes } from "@/lib/constants/routes";

export const dynamic = "force-dynamic";

export default function AdminArchivePage() {
  redirect(routes.adminTrashBin);
}
