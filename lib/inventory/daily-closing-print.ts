export const DAILY_CLOSING_PRINT_STYLES = `
@page {
  size: A4 landscape;
  margin: 8mm;
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 7.5pt;
    color: #475569;
  }
}

@media print {
  html,
  body {
    background: #fff !important;
    color: #111 !important;
  }

  .daily-closing-print-page {
    min-height: 0 !important;
    padding: 0 !important;
  }

  .daily-closing-print-root {
    width: 100% !important;
    border: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
    font-size: 8.5pt !important;
    line-height: 1.15 !important;
  }

  .daily-closing-print-root .screen-only {
    display: none !important;
  }

  .daily-closing-header {
    break-inside: avoid;
  }

  .daily-closing-title {
    padding: 5px 10px !important;
    font-size: 14pt !important;
    line-height: 1.1 !important;
  }

  .daily-closing-subtitle {
    padding: 3px 8px !important;
    font-size: 8pt !important;
    line-height: 1.1 !important;
  }

  .daily-closing-info-grid {
    grid-template-columns: 1fr 1fr !important;
    font-size: 8pt !important;
  }

  .daily-closing-info-grid > div {
    grid-template-columns: 27mm minmax(0, 1fr) !important;
  }

  .daily-closing-info-grid > div > * {
    padding: 3px 5px !important;
    line-height: 1.15 !important;
  }

  .daily-closing-items {
    margin-top: 5px !important;
    overflow: visible !important;
  }

  .daily-closing-items-table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    font-size: 7pt !important;
  }

  .daily-closing-items-table thead {
    display: table-header-group;
  }

  .daily-closing-items-table tr {
    break-inside: avoid;
  }

  .daily-closing-items-table th,
  .daily-closing-items-table td {
    padding: 3px 4px !important;
    line-height: 1.15 !important;
    vertical-align: top !important;
    overflow-wrap: anywhere;
  }

  .daily-closing-items-table th:nth-child(1) { width: 3%; }
  .daily-closing-items-table th:nth-child(2) { width: 34%; }
  .daily-closing-items-table th:nth-child(3) { width: 11%; }
  .daily-closing-items-table th:nth-child(4) { width: 10%; }
  .daily-closing-items-table th:nth-child(5),
  .daily-closing-items-table th:nth-child(6),
  .daily-closing-items-table th:nth-child(7),
  .daily-closing-items-table th:nth-child(8) { width: 6%; }
  .daily-closing-items-table th:nth-child(9) { width: 4%; }
  .daily-closing-items-table th:nth-child(10) { width: 14%; }

  .daily-closing-summary {
    margin-top: 5px !important;
    break-inside: avoid;
  }

  .daily-closing-summary > h2,
  .daily-closing-remarks > h2,
  .daily-closing-serial-details > h2 {
    padding: 4px 8px !important;
    font-size: 9pt !important;
    line-height: 1.1 !important;
  }

  .daily-closing-summary-grid {
    grid-template-columns: 1fr 1fr !important;
    font-size: 8pt !important;
  }

  .daily-closing-summary-grid > div > * {
    padding: 3px 5px !important;
    line-height: 1.1 !important;
  }

  .daily-closing-summary-stats {
    grid-template-columns: 1fr 1fr !important;
    gap: 2px 10px !important;
    padding: 4px 6px !important;
    font-size: 8pt !important;
    line-height: 1.1 !important;
  }

  .daily-closing-remarks {
    margin-top: 5px !important;
    break-inside: avoid;
  }

  .daily-closing-remarks > div {
    min-height: 0 !important;
    padding: 4px 6px !important;
    font-size: 8pt !important;
    line-height: 1.2 !important;
  }

  .daily-closing-signatures {
    margin-top: 14px !important;
    gap: 40px !important;
    break-inside: avoid;
    font-size: 8pt !important;
    line-height: 1.2 !important;
  }

  .daily-closing-signatures > div {
    padding-top: 3px !important;
  }

  .daily-closing-footnote {
    margin-top: 4px !important;
    font-size: 7pt !important;
    line-height: 1.1 !important;
  }

  .daily-closing-serial-details {
    break-before: page;
    margin-top: 0 !important;
  }
}
`;

