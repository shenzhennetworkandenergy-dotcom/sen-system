import { requireProfile } from "@/lib/auth/session";
import styles from "./murshida.module.css";

export default async function MurshidaManzilLayout({ children }: { children: React.ReactNode }) {
  await requireProfile(["admin"]);
  return <div className={styles.page}>{children}</div>;
}
