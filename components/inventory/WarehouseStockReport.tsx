import { siteConfig } from "@/config/site";
import type { WarehouseReportWarehouse, WarehouseStockReport } from "@/lib/inventory/warehouse-report";
import styles from "./WarehouseStockReport.module.css";

const number = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 4 });
const amount = (value: number, currency: string) => `${currency} ${value.toLocaleString("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})}`;
const dateTime = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka",
});

export function WarehouseStockReportView({ warehouse, stock, asOf, print = false }: {
  warehouse: WarehouseReportWarehouse;
  stock: WarehouseStockReport;
  asOf: Date;
  print?: boolean;
}) {
  const inCharge = warehouse.in_charge_name ?? "Not set";
  return (
    <article className={`${styles.report} ${print ? styles.printReport : ""}`}>
      <header className={styles.reportHeader}>
        <p className={styles.company}>{siteConfig.company.fullName}</p>
        <h2>Warehouse Stock Report</h2>
        <dl className={styles.metadata}>
          <div><dt>Warehouse</dt><dd>{warehouse.name} ({warehouse.code})</dd></div>
          <div><dt>Warehouse in-charge</dt><dd>{inCharge}</dd></div>
          <div><dt>As of</dt><dd>{dateTime.format(asOf)} (Dhaka time)</dd></div>
        </dl>
      </header>
      <div className={styles.tableWrapper}>
        <table className={styles.stockTable} aria-label="Stock by product and variation">
          <colgroup>
            <col className={styles.productColumn} />
            <col className={styles.quantityColumn} />
            <col className={styles.quantityColumn} />
            <col className={styles.priceColumn} />
            <col className={styles.priceColumn} />
          </colgroup>
          <thead><tr>
            <th scope="col">Product / SKU</th>
            <th scope="col">On hand</th>
            <th scope="col">Available</th>
            <th scope="col">Selling price</th>
            <th scope="col">Stock value</th>
          </tr></thead>
          <tbody>
            {stock.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  {row.name}
                  <span>{row.sku}{row.variation ? ` · ${row.variation}` : ""}</span>
                </th>
                <td>{number.format(row.onHand)}</td>
                <td>{number.format(row.available)}</td>
                <td>{row.unitPrice === null ? "Not set" : amount(row.unitPrice, row.currency)}</td>
                <td>{row.stockValue === null ? "—" : amount(row.stockValue, row.currency)}</td>
              </tr>
            ))}
            {stock.rows.length === 0 ? <tr><td colSpan={5} className={styles.empty}>No on-hand stock in this warehouse.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <footer className={styles.reportFooter}>
        <section className={styles.totals} aria-label="Warehouse totals">
          <h3>Warehouse totals</h3>
          <dl>
            <div><dt>Product / variation lines</dt><dd>{number.format(stock.rows.length)}</dd></div>
            <div><dt>Total on hand</dt><dd>{number.format(stock.onHand)}</dd></div>
            <div><dt>Total available</dt><dd>{number.format(stock.available)}</dd></div>
            {stock.totals.map(({ currency, amount: value }) => (
              <div className={styles.valueTotal} key={currency}><dt>Stock value · {currency}</dt><dd>{amount(value, currency)}</dd></div>
            ))}
          </dl>
          {stock.rows.length ? <p>Stock value uses on-hand quantity × selling price.{stock.unpriced ? ` ${stock.unpriced} line(s) without a price are excluded from the value.` : ""}</p> : null}
        </section>
        {print ? <div className={styles.signature}>
          <span>Warehouse in-charge signature</span>
          <strong>{inCharge}</strong>
        </div> : null}
      </footer>
    </article>
  );
}
