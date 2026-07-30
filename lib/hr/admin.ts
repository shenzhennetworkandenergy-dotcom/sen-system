import "server-only";
import { requireProfile } from "@/lib/auth/session";

export async function requireHrAdmin() {
  return requireProfile(["admin"]);
}
