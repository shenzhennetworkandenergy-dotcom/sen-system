import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const browserCandidates = process.platform === "win32"
  ? [
      "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

const browserExecutable = process.env.SEN_PRINT_BROWSER
  ?? browserCandidates.find((candidate) => existsSync(candidate));

const longProductNames = [
  "10G SFP+ Optical Transceiver Module",
  "Inspur Intel 82599ES X520-DA2 Dual-Port 10GbE SFP+ Network Card",
  "Intel XL710-QDA2 Dual-Port 40GbE QSFP+ Converged Network Adapter",
  "Mellanox ConnectX-3 CX354A Dual-Port QSFP+ 40GbE / 56Gb FDR InfiniBand VPI Network Adapter",
  "Supermicro AOC-STGN-I2S V2.00 Dual-Port 10GbE SFP+ Server Network Adapter",
];

function reportBody() {
  const rows = longProductNames.map((name, index) => `
    <tr>
      <td>${index + 1}</td><td><b>${name}</b></td><td>SEN-WC-${2356 + index}</td>
      <td>MODEL-${index + 1}</td><td>${index ? 0 : 375}</td><td>${index * 4}</td>
      <td>${index ? 0 : 5}</td><td>${index ? index * 4 : 370}</td><td>Pcs</td>
      <td>${index ? "" : "Inventory reconciliation required"}</td>
    </tr>`).join("");

  const infoRows = (left: Array<[string, string]>, right: Array<[string, string]>) => `
    <div>${left.map(([label, value]) => `<b>${label}</b><span>${value}</span>`).join("")}</div>
    <div>${right.map(([label, value]) => `<b>${label}</b><span>${value}</span>`).join("")}</div>`;

  return `
    <main class="daily-closing-print-page">
      <div class="daily-closing-print-root">
        <header class="daily-closing-header">
          <div class="daily-closing-title">DAILY INVENTORY UPDATE &amp; CLOSING SHEET</div>
          <div class="daily-closing-subtitle">Daily Stock Movement &amp; Closing Record – Hard Copy / Archive</div>
          <div class="daily-closing-info-grid">${infoRows(
            [["Company / Business", "Shenzhen Energy & Networks"], ["Warehouse / Location", "Dhaka Warehouse (SEN-DHAKA-BD)"], ["Inventory Date", "2026-08-22"], ["Sheet / Reference No.", "INV-CLS-20260822-493A14AE"]],
            [["Prepared By", "tuhin"], ["Checked By", "Not provided"], ["Closing Time", "Not provided"], ["Page", "Page 1"]],
          )}</div>
        </header>
        <section class="daily-closing-items"><table class="daily-closing-items-table">
          <thead><tr><th>SL</th><th>Product / Item Description</th><th>SKU / Code</th><th>Serial / Model</th><th>Opening Qty</th><th>Stock In</th><th>Stock Out</th><th>Closing Qty</th><th>Unit</th><th>Remarks</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></section>
        <section class="daily-closing-summary">
          <h2>DAILY INVENTORY SUMMARY</h2>
          <div class="daily-closing-summary-grid">
            <div><b>Total Product Lines Updated</b><span>5</span><b>Total Opening Quantity</b><span>375</span><b>Total Stock In</b><span>52</span><b>Total Stock Out</b><span>5</span></div>
            <div><b>Total Closing Quantity</b><span>422</span><b>Physical Count Verified</b><span>Not Verified</span><b>Variance / Difference</b><span>—</span><b>Closing Status</b><span>Reconciliation Required</span></div>
          </div>
          <div class="daily-closing-summary-stats"><span>Stock-in transactions: <b>4</b></span><span>Stock-out transactions: <b>2</b></span><span>Serialized units received: <b>0</b></span><span>Serialized units dispatched: <b>0</b></span></div>
        </section>
        <section class="daily-closing-remarks"><h2>GENERAL REMARKS / EXCEPTIONS</h2><div>No remarks recorded.</div></section>
        <footer class="daily-closing-signatures"><div>Prepared By Signature<br><b>tuhin</b></div><div>Checked By Signature<br><b>Not provided</b></div></footer>
        <p class="daily-closing-footnote">* Inventory reconciliation required · Generated 22/08/2026, 18:39:45</p>
      </div>
    </main>`;
}

test("five product rows fit on one A4 landscape page at browser default scale", {
  skip: browserExecutable ? false : "A Chromium browser is required for print pagination verification.",
}, async () => {
  const printModule = await import("../lib/inventory/daily-closing-print.ts").catch(() => ({
    DAILY_CLOSING_PRINT_STYLES: "",
  }));
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "sen-daily-closing-print-"));
  const htmlPath = join(fixtureDirectory, "five-products.html");
  const pdfPath = join(fixtureDirectory, "five-products.pdf");
  const baselineStyles = `
    @page{size:A4 landscape;margin:10mm}
    *{box-sizing:border-box} body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}
    .daily-closing-print-page{min-height:100vh;padding:24px}.daily-closing-print-root{border:1px solid #cbd5e1;padding:24px}
    .daily-closing-header{border:1px solid #cbd5e1}.daily-closing-title{padding:12px 16px;text-align:center;font-size:24px;font-weight:700;background:#1e4261;color:#fff}
    .daily-closing-subtitle{padding:6px 16px;text-align:center;font-size:14px;background:#dceaf5}.daily-closing-info-grid{display:grid;grid-template-columns:1fr 1fr;font-size:14px}
    .daily-closing-info-grid>div{display:grid;grid-template-columns:144px 1fr}.daily-closing-info-grid b,.daily-closing-info-grid span{border-top:1px solid #cbd5e1;padding:8px}.daily-closing-info-grid b{background:#f1f5f9}
    .daily-closing-items{margin-top:16px}.daily-closing-items table{width:100%;border-collapse:collapse;font-size:12px}.daily-closing-items th,.daily-closing-items td{border:1px solid #cbd5e1;padding:8px}.daily-closing-items th{background:#1e4261;color:#fff}
    .daily-closing-summary{margin-top:16px}.daily-closing-summary h2,.daily-closing-remarks h2{margin:0;padding:8px 12px;background:#1e4261;color:#fff;font-size:16px}.daily-closing-summary-grid{display:grid;grid-template-columns:1fr 1fr;font-size:14px}.daily-closing-summary-grid>div{display:grid;grid-template-columns:1fr auto}.daily-closing-summary-grid b,.daily-closing-summary-grid span{border:1px solid #cbd5e1;padding:8px}.daily-closing-summary-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #cbd5e1;padding:12px;font-size:14px}
    .daily-closing-remarks{margin-top:20px}.daily-closing-remarks>div{min-height:96px;border:1px solid #cbd5e1;padding:12px;font-size:14px}.daily-closing-signatures{display:grid;grid-template-columns:1fr 1fr;gap:64px;margin-top:40px;text-align:center;font-size:14px}.daily-closing-signatures>div{border-top:1px dashed #64748b;padding-top:8px}.daily-closing-footnote{margin-top:20px;text-align:right;font-size:12px}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${baselineStyles}${printModule.DAILY_CLOSING_PRINT_STYLES}</style></head><body>${reportBody()}</body></html>`;

  try {
    await writeFile(htmlPath, html, "utf8");
    const result = spawnSync(browserExecutable!, [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      new URL(`file:///${htmlPath.replaceAll("\\", "/")}`).href,
    ], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout || "Chromium print failed.");
    const pdf = (await readFile(pdfPath)).toString("latin1");
    const pageCount = pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    assert.equal(pageCount, 1, `Expected one A4 landscape page, received ${pageCount}.`);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
