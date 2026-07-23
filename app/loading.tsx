export default function Loading() {
  return <main className="grid min-h-[55vh] place-items-center px-6" role="status" aria-live="polite">
    <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-xl">
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700"/>
      <h1 className="mt-5 text-xl font-bold text-slate-950">Loading SEN workspace</h1>
      <p className="mt-2 text-sm text-slate-600">Preparing the latest information…</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-cyan-500 to-blue-700"/>
      </div>
    </div>
  </main>;
}
