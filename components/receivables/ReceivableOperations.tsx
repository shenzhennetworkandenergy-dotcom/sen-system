"use client";

import { useActionState } from "react";

import {
  confirmReceivableDisbursementAction,
  recordReceivableAdjustmentAction,
  recordReceivableRepaymentAction,
  reverseReceivableTransactionAction,
  transitionReceivableAction,
  updateReceivableScheduleAction,
} from "@/app/admin/receivables/actions";
import { initialReceivableActionState } from "@/lib/receivables/action-state";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "text-sm font-semibold text-slate-800";
const primaryButton =
  "rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

type OperationIds = {
  lifecycle: string;
  schedule: string;
  disbursement: string;
  repayment: string;
  adjustment: string;
  reversals: Record<string, string>;
};

type ReversibleTransaction = {
  id: string;
  transactionType: string;
  reversalOfTransactionId: string | null;
};

function Feedback({ status, message }: { status: string; message: string }) {
  if (!message) return null;
  return (
    <p
      aria-live="polite"
      className={`rounded-xl border p-3 text-sm ${
        status === "success"
          ? "border-green-200 bg-green-50 text-green-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      {message}
    </p>
  );
}

function ReversalForm({
  accountId,
  transactionId,
  operationId,
}: {
  accountId: string;
  transactionId: string;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(
    reverseReceivableTransactionAction,
    initialReceivableActionState,
  );
  return (
    <form action={action} className="mt-2 grid gap-2 rounded-lg border border-red-100 bg-red-50/40 p-2 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="operation_id" value={operationId} />
      <label className="text-xs font-semibold text-slate-700">
        Reversal date
        <input name="effective_date" type="date" required className={fieldClass} />
      </label>
      <label className="text-xs font-semibold text-slate-700">
        Reversal reason
        <input name="reason" required minLength={2} maxLength={2000} className={fieldClass} />
      </label>
      <button disabled={pending} className="self-end rounded-xl border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50">
        {pending ? "Reversing…" : "Record reversal"}
      </button>
      <div className="sm:col-span-3"><Feedback status={state.status} message={state.message} /></div>
    </form>
  );
}

export function ReceivableOperations({
  account,
  permissions,
  operationIds,
  transactions,
}: {
  account: {
    id: string;
    status: string;
    requestedAmount: number;
    approvedAmount: number | null;
    outstandingAmount: number;
    installmentCount: number | null;
    installmentAmount: number | null;
    firstDueDate: string | null;
  };
  permissions: {
    canCreate: boolean;
    canApprove: boolean;
    canDisburse: boolean;
    canRecordRepayment: boolean;
    canAdjust: boolean;
  };
  operationIds: OperationIds;
  transactions: ReversibleTransaction[];
}) {
  const [lifecycleState, lifecycleAction, lifecyclePending] = useActionState(
    transitionReceivableAction,
    initialReceivableActionState,
  );
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    updateReceivableScheduleAction,
    initialReceivableActionState,
  );
  const [disbursementState, disbursementAction, disbursementPending] = useActionState(
    confirmReceivableDisbursementAction,
    initialReceivableActionState,
  );
  const [repaymentState, repaymentAction, repaymentPending] = useActionState(
    recordReceivableRepaymentAction,
    initialReceivableActionState,
  );
  const [adjustmentState, adjustmentAction, adjustmentPending] = useActionState(
    recordReceivableAdjustmentAction,
    initialReceivableActionState,
  );
  const scheduleEditable = permissions.canCreate
    && ["requested", "under_review"].includes(account.status);
  const defaultLifecycleAction = account.status === "under_review"
    ? "approve"
    : account.status === "approved"
      ? "cancel"
      : permissions.canCreate
        ? "submit_review"
        : "reject";
  const reversibleIds = new Set(
    transactions.map((transaction) => transaction.reversalOfTransactionId).filter(Boolean),
  );

  return (
    <section className="space-y-4" aria-label="Receivable operations">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>Operational controls only.</strong> Accounting posting not yet automated. Payroll salary deduction is reserved for Phase 4.
      </div>

      {scheduleEditable ? (
        <form action={scheduleAction} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="operation_id" value={operationIds.schedule} />
          <h3 className="font-semibold text-[var(--primary)]">Pre-approval installment schedule</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>Installments<input name="installment_count" type="number" min="1" step="1" defaultValue={account.installmentCount ?? ""} className={fieldClass} /></label>
            <label className={labelClass}>Regular amount<input name="installment_amount" type="number" min="0.0001" step="0.0001" defaultValue={account.installmentAmount ?? ""} className={fieldClass} /></label>
            <label className={labelClass}>First due date<input name="first_due_date" type="date" defaultValue={account.firstDueDate ?? ""} className={fieldClass} /></label>
          </div>
          <Feedback status={scheduleState.status} message={scheduleState.message} />
          <button disabled={schedulePending} className={primaryButton}>{schedulePending ? "Saving…" : "Save schedule"}</button>
        </form>
      ) : null}

      {(permissions.canCreate && account.status === "requested") ||
      (permissions.canApprove && ["requested", "under_review", "approved"].includes(account.status)) ? (
        <form action={lifecycleAction} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="operation_id" value={operationIds.lifecycle} />
          <h3 className="font-semibold text-[var(--primary)]">Lifecycle decision</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>
              Action
              <select name="lifecycle_action" required className={fieldClass} defaultValue={defaultLifecycleAction}>
                {permissions.canCreate && account.status === "requested" ? <option value="submit_review">Submit for review</option> : null}
                {permissions.canApprove && account.status === "under_review" ? <option value="approve">Approve</option> : null}
                {permissions.canApprove && ["requested", "under_review"].includes(account.status) ? <option value="reject">Reject</option> : null}
                {permissions.canApprove && ["requested", "under_review", "approved"].includes(account.status) ? <option value="cancel">Cancel</option> : null}
              </select>
            </label>
            <label className={labelClass}>Approved amount<input name="approved_amount" type="number" min="0.0001" step="0.0001" defaultValue={account.approvedAmount ?? account.requestedAmount} className={fieldClass} /></label>
            <label className={labelClass}>Reason / review note<input name="reason" maxLength={2000} className={fieldClass} /></label>
          </div>
          <Feedback status={lifecycleState.status} message={lifecycleState.message} />
          <button disabled={lifecyclePending} className={primaryButton}>{lifecyclePending ? "Saving…" : "Apply lifecycle action"}</button>
        </form>
      ) : null}

      {permissions.canDisburse && account.status === "approved" ? (
        <form action={disbursementAction} className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="operation_id" value={operationIds.disbursement} />
          <h3 className="font-semibold text-violet-950">Confirm operational disbursement</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <label className={labelClass}>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required defaultValue={account.approvedAmount ?? ""} className={fieldClass} /></label>
            <label className={labelClass}>Effective date<input name="effective_date" type="date" required className={fieldClass} /></label>
            <label className={labelClass}>Method<select name="payment_method" required className={fieldClass}><option value="bank">Bank</option><option value="cash">Cash</option><option value="mfs">MFS / Mobile Banking</option><option value="other">Other</option></select></label>
            <label className={labelClass}>Note<input name="note" maxLength={2000} className={fieldClass} /></label>
          </div>
          <Feedback status={disbursementState.status} message={disbursementState.message} />
          <button disabled={disbursementPending} className={primaryButton}>{disbursementPending ? "Recording…" : "Confirm Disbursement"}</button>
        </form>
      ) : null}

      {permissions.canRecordRepayment && account.status === "active" ? (
        <form action={repaymentAction} className="space-y-3 rounded-2xl border border-green-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="operation_id" value={operationIds.repayment} />
          <h3 className="font-semibold text-green-950">Record operational repayment</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <label className={labelClass}>Amount<input name="amount" type="number" min="0.0001" max={account.outstandingAmount} step="0.0001" required className={fieldClass} /></label>
            <label className={labelClass}>Effective date<input name="effective_date" type="date" required className={fieldClass} /></label>
            <label className={labelClass}>Method<select name="payment_method" required className={fieldClass}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mfs">MFS / Mobile Banking</option><option value="other">Other</option></select></label>
            <label className={labelClass}>Note<input name="note" maxLength={2000} className={fieldClass} /></label>
          </div>
          <Feedback status={repaymentState.status} message={repaymentState.message} />
          <button disabled={repaymentPending} className={primaryButton}>{repaymentPending ? "Recording…" : "Record Repayment"}</button>
        </form>
      ) : null}

      {permissions.canAdjust && ["active", "fully_repaid"].includes(account.status) ? (
        <form action={adjustmentAction} className="space-y-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="operation_id" value={operationIds.adjustment} />
          <input type="hidden" name="has_approved_schedule" value={account.installmentCount ? "true" : "false"} />
          <h3 className="font-semibold text-amber-950">Controlled adjustment</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <label className={labelClass}>Direction<select name="direction" required className={fieldClass}><option value="decrease">Decrease / recover</option>{!account.installmentCount ? <option value="increase">Increase</option> : null}</select></label>
            <label className={labelClass}>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required className={fieldClass} /></label>
            <label className={labelClass}>Effective date<input name="effective_date" type="date" required className={fieldClass} /></label>
            <label className={labelClass}>Reason<input name="reason" required minLength={2} maxLength={2000} className={fieldClass} /></label>
          </div>
          <Feedback status={adjustmentState.status} message={adjustmentState.message} />
          <button disabled={adjustmentPending} className={primaryButton}>{adjustmentPending ? "Recording…" : "Record Adjustment"}</button>
        </form>
      ) : null}

      {permissions.canAdjust && transactions.some((transaction) => transaction.transactionType !== "reversal" && !reversibleIds.has(transaction.id)) ? (
        <details className="rounded-2xl border bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-red-900">Correct a transaction with an immutable reversal</summary>
          <div className="mt-3 space-y-2">
            {transactions
              .filter((transaction) => transaction.transactionType !== "reversal" && !reversibleIds.has(transaction.id))
              .map((transaction) => (
                <ReversalForm key={transaction.id} accountId={account.id} transactionId={transaction.id} operationId={operationIds.reversals[transaction.id]} />
              ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
