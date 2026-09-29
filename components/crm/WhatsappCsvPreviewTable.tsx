"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  finishWhatsappSheetEditAction,
  restorePreviousWhatsappSheetAction,
  saveWhatsappSheetAction,
  startWhatsappSheetEditAction,
} from "@/app/admin/crm/whatsapp/preview/actions";
import { WhatsappSheetToolbar } from "@/components/crm/WhatsappSheetToolbar";
import {
  sortWhatsappPreviewRows,
  type WhatsappPreviewSortDirection,
  type WhatsappPreviewSortKey,
} from "@/lib/crm/whatsapp-preview-sort";
import {
  buildWhatsappSheetSavePayload,
  resizeColumnWidth,
  shouldWarnBeforeUnload,
  type WhatsappSheetChanges,
  type WhatsappSheetSaveState,
} from "@/lib/crm/whatsapp-sheet-client";
import {
  canEditWhatsappCell,
  cellKey,
  isSystemWhatsappColumn,
  normalizeWhatsappSheetMetadata,
  type WhatsappCellFormat,
  type WhatsappSheetHeader,
  type WhatsappSheetMetadata,
} from "@/lib/crm/whatsapp-sheet-model";
import {
  WHATSAPP_CSV_HEADERS,
  whatsappCrmStatuses,
  type WhatsappCustomerRecord,
} from "@/lib/crm/whatsapp-records";

type Props = {
  admin: boolean;
  categorySlug: string;
  fileName: string;
  hasSnapshot: boolean;
  metadata: WhatsappSheetMetadata;
  revision: string;
  rows: WhatsappCustomerRecord[];
};
type Selection = { header: WhatsappSheetHeader; customerId?: string } | null;
type HistorySnapshot = { rows: WhatsappCustomerRecord[]; metadata: WhatsappSheetMetadata };

const defaultCellFormat: Required<WhatsappCellFormat> = {
  fontSize: 11,
  color: "#000000",
  backgroundColor: "#ffffff",
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  wrapText: false,
};

const emptyChanges = (categorySlug: string, sessionId: string, revision: string): WhatsappSheetChanges => ({
  categorySlug,
  sessionId,
  revision,
  patches: {},
  columnWidths: {},
  cellFormats: {},
  unlockCells: [],
});
const hasChanges = (changes: WhatsappSheetChanges) => Object.keys(changes.patches).length > 0
  || Object.keys(changes.columnWidths).length > 0
  || Object.keys(changes.cellFormats).length > 0
  || changes.unlockCells.length > 0;
const normalWidth = (header: WhatsappSheetHeader) => header === "conversation_history" ? 320
  : header === "interested_products" || header === "follow_up_report" ? 170
    : 120;

export function WhatsappCsvPreviewTable(props: Props) {
  const [rows, setRows] = useState(props.rows);
  const [metadata, setMetadata] = useState(() => normalizeWhatsappSheetMetadata(props.metadata));
  const [revision, setRevision] = useState(props.revision);
  const [hasSnapshot, setHasSnapshot] = useState(props.hasSnapshot);
  const [wrapConversation, setWrapConversation] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fitWidth, setFitWidth] = useState(1280);
  const [selection, setSelection] = useState<Selection>(null);
  const [saveState, setSaveState] = useState<WhatsappSheetSaveState>("idle");
  const [error, setError] = useState("");
  const [historyPosition, setHistoryPosition] = useState({ undo: 0, redo: 0 });
  const [sort, setSort] = useState<{ key: WhatsappPreviewSortKey; direction: WhatsappPreviewSortDirection }>({
    key: "last_communication_at",
    direction: "desc",
  });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  const metadataRef = useRef(metadata);
  const revisionRef = useRef(revision);
  const pendingRef = useRef(emptyChanges(props.categorySlug, metadata.activeSessionId ?? "", revision));
  const undoRef = useRef<HistorySnapshot[]>([]);
  const redoRef = useRef<HistorySnapshot[]>([]);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const busy = saveState === "saving";

  const updateRows = (next: WhatsappCustomerRecord[]) => { rowsRef.current = next; setRows(next); };
  const updateMetadata = (next: WhatsappSheetMetadata) => { metadataRef.current = next; setMetadata(next); };
  const snapshot = (): HistorySnapshot => ({
    rows: rowsRef.current.map((row) => ({ ...row })),
    metadata: normalizeWhatsappSheetMetadata(metadataRef.current),
  });
  const syncHistoryPosition = () => setHistoryPosition({ undo: undoRef.current.length, redo: redoRef.current.length });
  const remember = () => {
    undoRef.current.push(snapshot());
    redoRef.current = [];
    syncHistoryPosition();
  };
  const applyServerState = useCallback((state: { rows: WhatsappCustomerRecord[]; metadata: WhatsappSheetMetadata; revision: string; hasSnapshot: boolean }) => {
    rowsRef.current = state.rows;
    metadataRef.current = state.metadata;
    revisionRef.current = state.revision;
    setRows(state.rows);
    setMetadata(state.metadata);
    setRevision(state.revision);
    setHasSnapshot(state.hasSnapshot);
  }, []);

  const flushPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!hasChanges(pending)) return true;
    setSaveState("saving");
    setError("");
    const result = await saveWhatsappSheetAction(buildWhatsappSheetSavePayload(pending));
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return false;
    }
    applyServerState(result.state);
    pendingRef.current = emptyChanges(props.categorySlug, result.state.metadata.activeSessionId ?? "", result.state.revision);
    setSaveState("saved");
    return true;
  }, [applyServerState, props.categorySlug]);

  useEffect(() => { flushRef.current = flushPending; }, [flushPending]);

  const queueChanges = useCallback((change: (current: WhatsappSheetChanges) => WhatsappSheetChanges, valid = true) => {
    const sessionId = metadataRef.current.activeSessionId;
    if (!sessionId) return;
    const current = pendingRef.current.sessionId === sessionId
      ? pendingRef.current
      : emptyChanges(props.categorySlug, sessionId, revisionRef.current);
    pendingRef.current = change({ ...current, revision: revisionRef.current });
    setSaveState(valid ? "dirty" : "invalid");
    setError(valid ? "" : "Enter a valid international WhatsApp number before this row can be saved.");
  }, [props.categorySlug]);

  useEffect(() => {
    if (!editing || saveState !== "dirty") return;
    const timer = window.setTimeout(() => { void flushRef.current(); }, 800);
    return () => window.clearTimeout(timer);
  }, [editing, saveState, rows, metadata]);

  useEffect(() => {
    if (!shouldWarnBeforeUnload(saveState)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden" && saveState === "dirty") void flushRef.current();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => document.removeEventListener("visibilitychange", saveWhenHidden);
  }, [saveState]);

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === workspaceRef.current;
      setFullscreen(active);
      if (active && workspaceRef.current) setFitWidth(workspaceRef.current.clientWidth);
    };
    const fit = () => { if (document.fullscreenElement === workspaceRef.current && workspaceRef.current) setFitWidth(workspaceRef.current.clientWidth); };
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("resize", fit);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      window.removeEventListener("resize", fit);
    };
  }, []);

  const sortedRows = useMemo(() => sortWhatsappPreviewRows(rows, sort.key, sort.direction), [rows, sort]);
  const fullscreenDefault = Math.max(48, Math.floor((fitWidth - 4) / WHATSAPP_CSV_HEADERS.length));
  const widthFor = (header: WhatsappSheetHeader) => metadata.columnWidths[header] ?? (fullscreen ? fullscreenDefault : normalWidth(header));
  const tableWidth = WHATSAPP_CSV_HEADERS.reduce((total, header) => total + widthFor(header), 0);
  const selectedKeys = selection ? selection.customerId
    ? [cellKey(selection.customerId, selection.header)]
    : rows.map((row) => cellKey(row.customer_id, selection.header))
    : [];
  const selectedRecord = selection?.customerId ? rows.find((row) => row.customer_id === selection.customerId) : undefined;
  const canUnlock = Boolean(editing && selectedRecord && selection && !isSystemWhatsappColumn(selection.header)
    && !canEditWhatsappCell(selectedRecord, selection.header, metadata));

  const toggleSort = (key: WhatsappPreviewSortKey) => setSort((current) => current.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: key === "last_communication_at" ? "desc" : "asc" });
  const sortButton = (key: WhatsappPreviewSortKey) => {
    const active = sort.key === key;
    const label = key === "last_communication_at"
      ? active ? sort.direction === "desc" ? "Latest first" : "Oldest first" : "Sort conversations"
      : active ? sort.direction === "asc" ? "Soonest follow-up first" : "Latest follow-up first" : "Sort follow-ups";
    return <button aria-label={label} aria-pressed={active} className="ml-1 rounded border bg-[var(--surface)] px-1 py-0.5 text-[9px] font-bold leading-none" onClick={(event) => { event.stopPropagation(); toggleSort(key); }} title={label} type="button">
      {active ? sort.direction === "desc" ? "↓" : "↑" : "↕"}
    </button>;
  };

  const startEditing = async () => {
    setSaveState("saving");
    setError("");
    const result = await startWhatsappSheetEditAction(props.categorySlug);
    if (!result.ok) { setSaveState("error"); setError(result.error); return; }
    applyServerState(result.state);
    pendingRef.current = emptyChanges(props.categorySlug, result.state.metadata.activeSessionId ?? "", result.state.revision);
    setEditing(true);
    undoRef.current = [];
    redoRef.current = [];
    syncHistoryPosition();
    setSaveState("saved");
  };
  const finishEditing = async () => {
    if (saveState === "invalid" || !await flushPending()) return;
    const sessionId = metadataRef.current.activeSessionId;
    if (!sessionId) return;
    setSaveState("saving");
    const result = await finishWhatsappSheetEditAction(props.categorySlug, sessionId);
    if (!result.ok) { setSaveState("error"); setError(result.error); return; }
    applyServerState(result.state);
    pendingRef.current = emptyChanges(props.categorySlug, "", result.state.revision);
    setEditing(false);
    setSelection(null);
    undoRef.current = [];
    redoRef.current = [];
    syncHistoryPosition();
    setSaveState("saved");
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (workspaceRef.current?.requestFullscreen) await workspaceRef.current.requestFullscreen();
      else throw new Error("Full-screen view is not supported by this browser.");
    } catch (fullscreenError) {
      setError(fullscreenError instanceof Error ? fullscreenError.message : "Unable to open full-screen view.");
    }
  };
  const addRow = () => {
    const id = `new:${crypto.randomUUID()}`;
    const row = {
      ...Object.fromEntries(WHATSAPP_CSV_HEADERS.map((header) => [header, header === "status" ? "new" : ""])),
      customer_id: id,
      category_slug: props.categorySlug,
      assigned_to: "",
    } as WhatsappCustomerRecord;
    updateRows([...rowsRef.current, row]);
    updateMetadata(normalizeWhatsappSheetMetadata({ ...metadataRef.current, manualRows: [...metadataRef.current.manualRows, id] }));
    setSelection({ customerId: id, header: "whatsapp_name" });
    setSaveState("invalid");
    setError("Enter a valid international WhatsApp number before this row can be saved.");
  };
  const changeCell = (customerId: string, header: WhatsappSheetHeader, value: string) => {
    remember();
    const next = rowsRef.current.map((row) => row.customer_id === customerId ? { ...row, [header]: value } : row);
    updateRows(next);
    const key = cellKey(customerId, header);
    const valid = !customerId.startsWith("new:") || /^\d{8,15}$/.test(next.find((row) => row.customer_id === customerId)?.whatsapp_number.replace(/\D/g, "") ?? "");
    queueChanges((current) => ({ ...current, patches: { ...current.patches, [key]: { customerId, header, value } } }), valid);
  };
  const unlockCell = () => {
    if (!selection?.customerId || !canUnlock) return;
    const key = cellKey(selection.customerId, selection.header);
    updateMetadata(normalizeWhatsappSheetMetadata({ ...metadataRef.current, editableCells: [...metadataRef.current.editableCells, key] }));
    queueChanges((current) => ({ ...current, unlockCells: [...current.unlockCells, key] }));
  };
  const formatSelection = (format: WhatsappCellFormat) => {
    if (!selectedKeys.length) return;
    remember();
    const cellFormats = Object.fromEntries(selectedKeys.map((key) => [key, { ...defaultCellFormat, ...metadataRef.current.cellFormats[key], ...format }]));
    updateMetadata(normalizeWhatsappSheetMetadata({ ...metadataRef.current, cellFormats: { ...metadataRef.current.cellFormats, ...cellFormats } }));
    queueChanges((current) => ({ ...current, cellFormats: { ...current.cellFormats, ...cellFormats } }));
  };
  const formatCommand = (command: "bold" | "italic" | "underline" | "align-left" | "align-center" | "align-right" | "wrap" | "clip") => {
    if (command === "bold") return formatSelection({ fontWeight: "bold" });
    if (command === "italic") return formatSelection({ fontStyle: "italic" });
    if (command === "underline") return formatSelection({ textDecoration: "underline" });
    if (command === "align-left") return formatSelection({ textAlign: "left" });
    if (command === "align-center") return formatSelection({ textAlign: "center" });
    if (command === "align-right") return formatSelection({ textAlign: "right" });
    formatSelection({ wrapText: command === "wrap" });
  };
  const restoreHistory = (target: HistorySnapshot) => {
    const currentRows = new Map(rowsRef.current.map((row) => [row.customer_id, row]));
    const patches = target.rows.flatMap((row) => {
      const current = currentRows.get(row.customer_id);
      if (!current) return [];
      return WHATSAPP_CSV_HEADERS.flatMap((header) => current[header] === row[header] ? [] : [{ customerId: row.customer_id, header, value: row[header] }]);
    });
    const formatKeys = new Set([...Object.keys(metadataRef.current.cellFormats), ...Object.keys(target.metadata.cellFormats)]);
    const cellFormats = Object.fromEntries([...formatKeys].map((key) => [key, {
      ...defaultCellFormat,
      ...target.metadata.cellFormats[key],
    }]));
    updateRows(target.rows.map((row) => ({ ...row })));
    updateMetadata(normalizeWhatsappSheetMetadata({ ...target.metadata, cellFormats }));
    queueChanges((current) => ({
      ...current,
      patches: { ...current.patches, ...Object.fromEntries(patches.map((patch) => [cellKey(patch.customerId, patch.header), patch])) },
      cellFormats: { ...current.cellFormats, ...cellFormats },
    }));
  };
  const undo = () => {
    const target = undoRef.current.pop();
    if (!target) return;
    redoRef.current.push(snapshot());
    restoreHistory(target);
    syncHistoryPosition();
  };
  const redo = () => {
    const target = redoRef.current.pop();
    if (!target) return;
    undoRef.current.push(snapshot());
    restoreHistory(target);
    syncHistoryPosition();
  };
  const setColumnWidth = (header: WhatsappSheetHeader, width: number) => updateMetadata(normalizeWhatsappSheetMetadata({
    ...metadataRef.current,
    columnWidths: { ...metadataRef.current.columnWidths, [header]: width },
  }));
  const queueColumnWidth = (header: WhatsappSheetHeader, width: number) => queueChanges((current) => ({
    ...current,
    columnWidths: { ...current.columnWidths, [header]: width },
  }));
  const startResize = (header: WhatsappSheetHeader, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!editing || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthFor(header);
    let latest = startWidth;
    const move = (pointer: PointerEvent) => { latest = resizeColumnWidth(startWidth, pointer.clientX - startX); setColumnWidth(header, latest); };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      queueColumnWidth(header, latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const resizeWithKeyboard = (header: WhatsappSheetHeader, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!editing || busy || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const width = resizeColumnWidth(widthFor(header), event.key === "ArrowRight" ? 8 : -8);
    setColumnWidth(header, width);
    queueColumnWidth(header, width);
  };
  const resetColumns = () => {
    const width = Math.max(48, Math.floor(((workspaceRef.current?.clientWidth ?? fitWidth) - 4) / WHATSAPP_CSV_HEADERS.length));
    const columnWidths = Object.fromEntries(WHATSAPP_CSV_HEADERS.map((header) => [header, width]));
    updateMetadata(normalizeWhatsappSheetMetadata({ ...metadataRef.current, columnWidths }));
    queueChanges((current) => ({ ...current, columnWidths }));
  };
  const restore = async () => {
    if (!window.confirm("Restore the CSV data and formatting from before the latest edit session?")) return;
    setSaveState("saving");
    const result = await restorePreviousWhatsappSheetAction(props.categorySlug);
    if (!result.ok) { setSaveState("error"); setError(result.error); return; }
    applyServerState(result.state);
    pendingRef.current = emptyChanges(props.categorySlug, "", result.state.revision);
    setEditing(false);
    setSelection(null);
    setSaveState("saved");
  };

  return <div ref={workspaceRef} className={`overflow-hidden rounded-lg border bg-[var(--surface)] ${fullscreen ? "flex h-screen flex-col rounded-none" : ""}`}>
    <WhatsappSheetToolbar
      admin={props.admin}
      busy={busy}
      canUnlock={canUnlock}
      canRedo={historyPosition.redo > 0}
      canUndo={historyPosition.undo > 0}
      editing={editing}
      fullscreen={fullscreen}
      hasSelection={Boolean(selection)}
      hasSnapshot={hasSnapshot}
      onAddRow={addRow}
      onBackgroundColor={(value) => formatSelection({ backgroundColor: value })}
      onFinishEditing={() => { void finishEditing(); }}
      onFontSize={(value) => formatSelection({ fontSize: value })}
      onFormat={formatCommand}
      onFullscreen={() => { void toggleFullscreen(); }}
      onResetColumns={resetColumns}
      onRedo={redo}
      onRestore={() => { void restore(); }}
      onStartEditing={() => { void startEditing(); }}
      onTextColor={(value) => formatSelection({ color: value })}
      onUndo={undo}
      onUnlock={unlockCell}
      saveState={saveState}
    />
    {error ? <p className="border-b bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">{error}</p> : null}
    <div className={`${fullscreen ? "min-h-0 flex-1" : "max-h-[calc(100vh-14rem)]"} overflow-auto`}>
      <table className="table-fixed border-collapse text-left text-[11px] leading-none" style={{ width: tableWidth }}>
        <colgroup>{WHATSAPP_CSV_HEADERS.map((header) => <col key={header} style={{ width: widthFor(header) }} />)}</colgroup>
        <thead className="sticky top-0 z-20 bg-[var(--muted-surface)]">
          <tr>{WHATSAPP_CSV_HEADERS.map((header) => <th className={`relative whitespace-normal border-b border-r px-1 py-1 align-top [overflow-wrap:anywhere] ${selection?.header === header && !selection.customerId ? "outline outline-2 outline-blue-500" : ""}`} key={header} onClick={() => setSelection({ header })} style={{ whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <span className="block leading-tight">{header}</span>
            {header === "conversation_history" ? <button aria-label={wrapConversation ? "Straight conversation history" : "Wrap conversation history"} aria-pressed={wrapConversation} className="ml-1 rounded border bg-[var(--surface)] px-1 py-0.5 text-[9px] font-bold leading-none" onClick={(event) => { event.stopPropagation(); setWrapConversation((value) => !value); }} title={wrapConversation ? "Straight conversation history" : "Wrap conversation history"} type="button">{wrapConversation ? "→" : "↵"}</button> : null}
            {header === "last_communication_at" || header === "next_follow_up_at" ? sortButton(header) : null}
            <button aria-label={`Resize ${header} column`} className="absolute -right-1 top-0 h-full w-2 cursor-col-resize touch-none focus:bg-blue-500" disabled={!editing || busy} onKeyDown={(event) => resizeWithKeyboard(header, event)} onPointerDown={(event) => startResize(header, event)} type="button" />
          </th>)}</tr>
        </thead>
        <tbody>
          {sortedRows.map((record) => <tr className="h-6 border-b align-top last:border-b-0" key={record.customer_id}>
            {WHATSAPP_CSV_HEADERS.map((header) => {
              const value = record[header] || "";
              const key = cellKey(record.customer_id, header);
              const cellFormat = metadata.cellFormats[key];
              const selected = selection?.customerId === record.customer_id && selection.header === header;
              const editable = props.admin && editing && !busy && canEditWhatsappCell(record, header, metadata);
              const wraps = cellFormat?.wrapText || (wrapConversation && header === "conversation_history");
              const style = {
                backgroundColor: cellFormat?.backgroundColor,
                color: cellFormat?.color,
                fontSize: cellFormat?.fontSize,
                fontWeight: cellFormat?.fontWeight,
                fontStyle: cellFormat?.fontStyle,
                textDecoration: cellFormat?.textDecoration,
                textAlign: cellFormat?.textAlign,
              };
              return <td className={`${wraps ? "whitespace-pre-wrap break-words" : "truncate whitespace-nowrap"} border-r px-1 py-0.5 ${selected ? "outline outline-2 outline-blue-500" : ""}`} key={header} onClick={() => setSelection({ customerId: record.customer_id, header })} style={style} title={value || undefined}>
                {editable ? header === "status" ? <select aria-label={`${header} for ${record.whatsapp_name || "new customer"}`} className="h-5 w-full bg-transparent text-[11px] outline-none" onChange={(event) => changeCell(record.customer_id, header, event.target.value)} value={value || "new"}>{whatsappCrmStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                  : header === "conversation_history" && wrapConversation ? <textarea aria-label={`${header} for ${record.whatsapp_name || "new customer"}`} className="min-h-16 w-full resize-y bg-transparent text-[11px] leading-tight outline-none" onChange={(event) => changeCell(record.customer_id, header, event.target.value)} value={value} />
                    : <input aria-label={`${header} for ${record.whatsapp_name || "new customer"}`} className="h-5 w-full bg-transparent text-[11px] outline-none" onChange={(event) => changeCell(record.customer_id, header, event.target.value)} value={value} />
                  : (header === "messenger_profile_link" || header === "whatsapp_link") && /^https?:\/\//i.test(value)
                    ? <a className="text-blue-700 underline" href={value} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">Open</a>
                    : <span>{value || "—"}{editing && !isSystemWhatsappColumn(header) && !canEditWhatsappCell(record, header, metadata) ? " 🔒" : ""}</span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
      {!rows.length ? <p className="p-8 text-center text-[var(--muted-text)]">The offline WhatsApp CRM file does not contain any customer records yet.</p> : null}
    </div>
  </div>;
}
