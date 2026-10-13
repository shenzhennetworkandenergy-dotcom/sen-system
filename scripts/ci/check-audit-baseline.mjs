import { appendFile, readFile } from "node:fs/promises";

const auditPath = process.argv[2] ?? "audit.json";
const reviewedAdvisories = new Set([
  "GHSA-2883-xcg3-v3hh",
  "GHSA-2v37-7h3g-55p8",
  "GHSA-5p4m-2wfm-xmqj",
  "GHSA-68fv-2mgg-jv7q",
  "GHSA-6j4f-fj2g-mc7p",
  "GHSA-73wf-gq98-2v4g",
  "GHSA-c83g-rgw3-j3cx",
  "GHSA-q2hr-2g5m-vwhr",
  "GHSA-qhr7-859c-m2p7",
  "GHSA-vfj7-8cjw-p6xm",
  "GHSA-w5vr-8v7q-w6rv",
]);

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const metadata = audit.metadata?.vulnerabilities;

if (!metadata || !audit.vulnerabilities) {
  throw new Error("npm audit output is incomplete or has an unexpected schema");
}

const observedAdvisories = new Map();

for (const vulnerability of Object.values(audit.vulnerabilities)) {
  for (const advisory of vulnerability.via ?? []) {
    if (typeof advisory === "string" || typeof advisory?.url !== "string") {
      continue;
    }

    const advisoryId = advisory.url.split("/").at(-1);
    if (advisoryId) {
      observedAdvisories.set(advisoryId, advisory.severity ?? vulnerability.severity);
    }
  }
}

const unexpectedHighOrCritical = [...observedAdvisories.entries()].filter(
  ([advisoryId, severity]) =>
    (severity === "high" || severity === "critical") &&
    !reviewedAdvisories.has(advisoryId),
);
const missingReviewedAdvisories = [...reviewedAdvisories].filter(
  (advisoryId) => !observedAdvisories.has(advisoryId),
);

const summary = [
  "## Dependency security baseline",
  "",
  `- Critical vulnerable package nodes: ${metadata.critical ?? 0}`,
  `- High vulnerable package nodes: ${metadata.high ?? 0}`,
  `- Moderate vulnerable package nodes: ${metadata.moderate ?? 0}`,
  `- Low vulnerable package nodes: ${metadata.low ?? 0}`,
  `- Observed advisory identifiers: ${observedAdvisories.size}`,
  `- Reviewed advisories no longer observed: ${missingReviewedAdvisories.length}`,
  `- Unexpected high/critical advisories: ${unexpectedHighOrCritical.length}`,
].join("\n");

console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
}

if ((metadata.critical ?? 0) > 0) {
  throw new Error("Critical dependency advisories are present");
}

if (unexpectedHighOrCritical.length > 0) {
  throw new Error(
    `Unexpected high/critical advisories: ${unexpectedHighOrCritical
      .map(([advisoryId]) => advisoryId)
      .join(", ")}`,
  );
}
