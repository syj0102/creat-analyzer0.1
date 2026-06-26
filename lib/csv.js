const fs = require("fs");

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsv(text) {
  const input = String(text || "").replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => String(item || "").trim() !== ""));
}

function makeUniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const clean = String(header || `column_${index + 1}`).trim() || `column_${index + 1}`;
    const count = seen.get(clean) || 0;
    seen.set(clean, count + 1);
    return count === 0 ? clean : `${clean}_${count + 1}`;
  });
}

function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = makeUniqueHeaders(rows[0]);
  return rows.slice(1).map((items) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = items[index] == null ? "" : String(items[index]).trim();
    });
    return record;
  });
}

function readCsvFile(filepath) {
  return parseCsvObjects(fs.readFileSync(filepath, "utf8"));
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
  parseCsv,
  parseCsvObjects,
  readCsvFile,
  toCsv,
  writeCsvFile,
};
