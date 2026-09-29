import { clampHrProgress, type HrTone } from "@/lib/hr/presentation";
import styles from "./hr-visuals.module.css";

export function HrProgressBar({
  label,
  value,
  max = 100,
  detail,
  tone = "info",
}: {
  label: string;
  value: number;
  max?: number;
  detail?: string;
  tone?: HrTone;
}) {
  const percentage = clampHrProgress(max > 0 ? (value / max) * 100 : 0);
  return (
    <div className={`${styles.progressBlock} ${styles[tone]}`}>
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>{label}</span>
        <span className={styles.progressDetail}>{detail ?? `${Math.round(percentage)}%`}</span>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(Math.max(value, 0), Math.max(max, 0))}
      >
        <div className={styles.progressValue} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

