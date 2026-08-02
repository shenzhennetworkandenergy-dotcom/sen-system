import {
  customerOrderStatusCopy,
  customerOrderStatuses,
  type CustomerOrderStatus,
} from "@/lib/orders/customer-status";

export function OrderProgress({ status }: { status: CustomerOrderStatus }) {
  const activeIndex =
    status === "awaiting_confirmation"
      ? -1
      : customerOrderStatuses.indexOf(status);

  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            Current order status
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {customerOrderStatusCopy[status].label}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {customerOrderStatusCopy[status].description}
          </p>
        </div>
        <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
          {status === "awaiting_confirmation"
            ? "Waiting for SEN"
            : `Step ${activeIndex + 1} of ${customerOrderStatuses.length}`}
        </span>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-5">
        {customerOrderStatuses.map((item, index) => {
          const completed = activeIndex >= index;
          const current = activeIndex === index;
          return (
            <li
              key={item}
              className={`sen-order-progress-step rounded-xl border p-3 text-xs transition ${
                current
                  ? "is-current shadow-md"
                  : completed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <span className="block font-bold">{index + 1}</span>
              <span className="mt-1 block font-semibold">
                {customerOrderStatusCopy[item].label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

