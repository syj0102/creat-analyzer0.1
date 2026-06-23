const fs = require("fs");

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function writeCsvFile(filepath, rows, headers, { bom = false } = {}) {
  const csv = toCsv(rows, headers);
  fs.writeFileSync(filepath, `${bom ? "\ufeff" : ""}${csv}`, "utf8");
}

module.exports = {
  csvEscape,
  toCsv,
  writeCsvFile,
};
