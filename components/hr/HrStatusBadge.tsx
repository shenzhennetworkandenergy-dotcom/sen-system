import {
  getHrStatusPresentation,
  type HrTone,
} from "@/lib/hr/presentation";
import styles from "./hr-visuals.module.css";

export function HrStatusBadge({
  status,
  label,
  tone,
}: {
  status?: string | null;
  label?: string;
  tone?: HrTone;
}) {
  const presentation = getHrStatusPresentation(status || label || "not_set");
  const resolvedTone = tone ?? presentation.tone;
  return (
    <span className={`${styles.badge} ${styles[resolvedTone]}`}>
      {label ?? presentation.label}
    </span>
  );
}

