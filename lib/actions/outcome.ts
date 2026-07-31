export type ActionOutcome = {
  kind: "success" | "warning" | "error";
  message: string;
};

export function actionOutcomeUrl(path: string, outcome: ActionOutcome) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${outcome.kind}=${encodeURIComponent(outcome.message)}`;
}
