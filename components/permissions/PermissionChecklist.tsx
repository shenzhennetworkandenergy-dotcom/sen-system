"use client";

import { useState } from "react";
import type { PermissionModule } from "@/lib/auth/permissions";
import { permissionModuleSelectionSummary } from "@/lib/permissions/checklist";

export function PermissionChecklist({ modules, initialSelected, templateKeys = [], allowKeys = [], denyKeys = [], inputName = "permissionKeys" }: {
  modules: PermissionModule[];
  initialSelected: string[];
  templateKeys?: string[];
  allowKeys?: string[];
  denyKeys?: string[];
  inputName?: string;
}) {
  const template = new Set(templateKeys);
  const allowed = new Set(allowKeys);
  const denied = new Set(denyKeys);
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const replaceModule = (keys: string[], checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    keys.forEach((key) => checked ? next.add(key) : next.delete(key));
    return next;
  });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted-text)]">{selected.size} permissions selected</p>
      <button type="button" onClick={() => setSelected(new Set(template))} className="rounded border px-3 py-2 text-sm font-semibold">Reset to template</button>
    </div>
    {modules.map((module) => {
      const keys = module.permissions.map((permission) => permission.key);
      const summary = permissionModuleSelectionSummary(keys, selected);
      return <details key={module.id} data-testid={`permission-module-${module.key}`} className="group rounded-xl border bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{module.name}</span>
            <span className="mt-1 block text-sm text-[var(--muted-text)]">{module.description}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="rounded-full bg-[var(--muted-surface)] px-3 py-1 text-xs font-semibold">{summary.label}</span>
            <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <fieldset className="border-t p-4">
          <legend className="sr-only">{module.name}</legend>
        <div className="mb-3 flex gap-2"><button type="button" onClick={() => replaceModule(keys, true)} className="rounded border px-3 py-1 text-xs font-semibold">Select all</button><button type="button" onClick={() => replaceModule(keys, false)} className="rounded border px-3 py-1 text-xs font-semibold">Clear module</button></div>
        <div className="grid gap-2 md:grid-cols-2">{module.permissions.map((permission) => {
          const origin = allowed.has(permission.key) ? "Explicit allow" : denied.has(permission.key) ? "Explicit deny" : template.has(permission.key) ? "Template" : "Not granted";
          return <label key={permission.id} className="flex items-start gap-3 rounded-lg border p-3">
            <input type="checkbox" name={inputName} value={permission.key} checked={selected.has(permission.key)} onChange={(event) => replaceModule([permission.key], event.target.checked)} className="mt-1" />
            <span><span className="font-medium">{permission.name}</span>{permission.is_sensitive ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Sensitive</span> : null}<span className="block text-xs text-[var(--muted-text)]">{permission.description}</span><span className="mt-1 block text-xs font-semibold">{origin}</span></span>
          </label>;
        })}</div>
        </fieldset>
      </details>;
    })}
  </div>;
}
