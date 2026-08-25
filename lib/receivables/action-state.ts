export type ReceivableActionState = {
  status: "idle" | "success" | "error";
  message: string;
  accountId?: string;
  transactionId?: string;
};

export const initialReceivableActionState: ReceivableActionState = {
  status: "idle",
  message: "",
};
