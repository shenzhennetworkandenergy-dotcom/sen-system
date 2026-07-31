"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  filterEmployeeOptions,
  type EmployeeOption,
} from "@/lib/hr/form-options";

export function EmployeeCombobox({
  employees,
  name = "employee_record_id",
  defaultValue = "",
  required = false,
  className = "",
  placeholder = "Search employee name, email or number",
}: {
  employees: EmployeeOption[];
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const defaultEmployee = employees.find((item) => item.id === defaultValue);
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [query, setQuery] = useState(defaultEmployee?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(
    () => filterEmployeeOptions(employees, selectedId ? "" : query),
    [employees, query, selectedId],
  );

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const select = (employee: EmployeeOption) => {
    setSelectedId(employee.id);
    setQuery(employee.label);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedId("");
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            select(matches[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${name}-employee-options`}
        aria-label="Employee"
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      {open ? (
        <div
          id={`${name}-employee-options`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl"
        >
          {matches.map((employee, index) => (
            <button
              key={employee.id}
              type="button"
              role="option"
              aria-selected={employee.id === selectedId}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(employee)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                index === activeIndex ? "bg-blue-50 text-blue-950" : "hover:bg-slate-50"
              }`}
            >
              <strong className="block">{employee.name || employee.employeeNumber}</strong>
              <span className="text-xs text-slate-600">
                {[employee.employeeNumber, employee.email].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
          {!matches.length ? (
            <p className="px-3 py-4 text-sm text-slate-600">No employee matches this search.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

