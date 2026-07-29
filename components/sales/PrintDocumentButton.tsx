"use client";

export function PrintDocumentButton({ fileName }: { fileName?: string }) {
  const print = () => {
    const previousTitle = document.title;
    if (fileName) {
      document.title = fileName
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);
    }
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 1_000);
  };

  return (
    <button
      type="button"
      onClick={print}
      className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
