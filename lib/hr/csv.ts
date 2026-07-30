export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"","\"\"")}"`;
}

export function csvResponse(rows: unknown[][], filename: string) {
  const body = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(body,{
    headers:{
      "content-type":"text/csv; charset=utf-8",
      "content-disposition":`attachment; filename="${filename}"`,
      "cache-control":"private, no-store",
    },
  });
}
