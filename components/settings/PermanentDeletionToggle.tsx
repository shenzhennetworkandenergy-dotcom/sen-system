import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

export function PermanentDeletionToggle({
  enabled,
  action,
}: {
  enabled: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="mt-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4">
        <input
          type="checkbox"
          name="permanent_deletion"
          value="enabled"
          defaultChecked={enabled}
          className="mt-1 h-5 w-5"
        />
        <span>
          <strong className="block">Permanent Deletion Mode</strong>
          <span className="mt-1 block text-sm text-[var(--muted-text)]">
            {enabled
              ? "Enabled: eligible records are permanently removed."
              : "Disabled: delete actions move records into the Archive."}
          </span>
        </span>
      </label>
      <ConfirmSubmitButton
        confirmation={
          enabled
            ? "Disable permanent deletion and make future delete actions archive records?"
            : "Enable permanent deletion? Eligible records deleted while this is enabled cannot be recovered."
        }
        className={`mt-4 rounded-lg px-5 py-3 font-bold text-white ${
          enabled ? "bg-emerald-700" : "bg-red-700"
        }`}
      >
        {enabled ? "Turn off permanent deletion" : "Turn on permanent deletion"}
      </ConfirmSubmitButton>
    </form>
  );
}
