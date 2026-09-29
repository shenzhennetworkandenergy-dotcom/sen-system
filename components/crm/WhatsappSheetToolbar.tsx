"use client";

import type { WhatsappSheetSaveState } from "@/lib/crm/whatsapp-sheet-client";

type Props = {
  admin: boolean;
  editing: boolean;
  fullscreen: boolean;
  hasSelection: boolean;
  hasSnapshot: boolean;
  saveState: WhatsappSheetSaveState;
  busy: boolean;
  canUnlock: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onAddRow: () => void;
  onBackgroundColor: (value: string) => void;
  onFinishEditing: () => void;
  onFontSize: (value: number) => void;
  onFormat: (format: "bold" | "italic" | "underline" | "align-left" | "align-center" | "align-right" | "wrap" | "clip") => void;
  onFullscreen: () => void;
  onResetColumns: () => void;
  onRedo: () => void;
  onRestore: () => void;
  onStartEditing: () => void;
  onTextColor: (value: string) => void;
  onUndo: () => void;
  onUnlock: () => void;
};

const button = "rounded border bg-[var(--surface)] px-2 py-1 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40";

export function WhatsappSheetToolbar(props: Props) {
  const canFormat = props.admin && props.editing && props.hasSelection && !props.busy;
  return <div className="sticky top-0 z-30 flex flex-wrap items-center gap-1 border-b bg-[var(--muted-surface)] p-1.5 shadow-sm">
    <button className={button} onClick={props.onFullscreen} type="button">
      {props.fullscreen ? "Exit full screen" : "Full screen"}
    </button>
    {props.admin ? props.editing
      ? <button className={button} disabled={props.busy} onClick={props.onFinishEditing} type="button">Finish editing</button>
      : <button className={button} disabled={props.busy} onClick={props.onStartEditing} type="button">Turn on Edit mode</button>
      : null}
    {props.admin && props.editing ? <>
      <button aria-label="Undo" className={button} disabled={!props.canUndo || props.busy} onClick={props.onUndo} title="Undo last cell edit or format" type="button">↶ Undo</button>
      <button aria-label="Redo" className={button} disabled={!props.canRedo || props.busy} onClick={props.onRedo} title="Redo last cell edit or format" type="button">↷ Redo</button>
      <button className={button} disabled={props.busy} onClick={props.onAddRow} type="button">Add row</button>
      <button className={button} disabled={!props.canUnlock || props.busy} onClick={props.onUnlock} type="button">Unlock cell</button>
      <span className="mx-0.5 h-6 border-l" />
      <button aria-label="Bold" className={button} disabled={!canFormat} onClick={() => props.onFormat("bold")} title="Bold" type="button"><strong>B</strong></button>
      <button aria-label="Italic" className={button} disabled={!canFormat} onClick={() => props.onFormat("italic")} title="Italic" type="button"><em>I</em></button>
      <button aria-label="Underline" className={button} disabled={!canFormat} onClick={() => props.onFormat("underline")} title="Underline" type="button"><u>U</u></button>
      <button aria-label="Align left" className={button} disabled={!canFormat} onClick={() => props.onFormat("align-left")} title="Align left" type="button">≡</button>
      <button aria-label="Align center" className={button} disabled={!canFormat} onClick={() => props.onFormat("align-center")} title="Align center" type="button">≡</button>
      <button aria-label="Align right" className={button} disabled={!canFormat} onClick={() => props.onFormat("align-right")} title="Align right" type="button">≡</button>
      <button aria-label="Wrap text" className={button} disabled={!canFormat} onClick={() => props.onFormat("wrap")} title="Wrap text" type="button">↵ Wrap</button>
      <button aria-label="Clip text" className={button} disabled={!canFormat} onClick={() => props.onFormat("clip")} title="Clip text" type="button">→ Clip</button>
      <label className="flex items-center gap-1 rounded border bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold">
        Font size
        <input aria-label="Font size" className="w-12 border px-1 py-0.5" defaultValue={11} disabled={!canFormat} max={24} min={8} onChange={(event) => props.onFontSize(Number(event.target.value))} type="number" />
      </label>
      <label className="flex items-center gap-1 rounded border bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold">
        Text color
        <input aria-label="Text color" disabled={!canFormat} onChange={(event) => props.onTextColor(event.target.value)} type="color" />
      </label>
      <label className="flex items-center gap-1 rounded border bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold">
        Background color
        <input aria-label="Background color" defaultValue="#ffffff" disabled={!canFormat} onChange={(event) => props.onBackgroundColor(event.target.value)} type="color" />
      </label>
    </> : null}
    <button className={button} disabled={!props.admin || !props.editing || props.busy} onClick={props.onResetColumns} type="button">Reset column sizes</button>
    {props.admin ? <button className={button} disabled={!props.hasSnapshot || props.busy} onClick={props.onRestore} type="button">Restore Previous Version</button> : null}
    <span aria-label="Save status" className="ml-auto rounded border bg-[var(--surface)] px-2 py-1 text-[10px] font-bold capitalize">{props.saveState}</span>
  </div>;
}
