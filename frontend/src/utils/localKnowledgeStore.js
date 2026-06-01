const PREFIX = "china-narrative-platform";
const PREFACE_KEY = `${PREFIX}:story-prefaces:v1`;
const WILHELM_KEY = `${PREFIX}:wilhelm-folktales:v1`;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadJson(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function parseDelimited(text) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!rows.length) return [];
  const delimiter = rows[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(rows[0], delimiter).map((header) => header.trim());
  return rows.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    return headers.reduce((row, header, index) => {
      row[header || `字段${index + 1}`] = cells[index] || "";
      return row;
    }, {});
  });
}

export function loadPrefaces() {
  return loadJson(PREFACE_KEY, {});
}

export function savePrefaces(prefaces) {
  saveJson(PREFACE_KEY, prefaces);
}

export function loadWilhelmRecords() {
  return loadJson(WILHELM_KEY, []);
}

export function saveWilhelmRecords(records) {
  saveJson(WILHELM_KEY, records);
}

export async function parseTableFile(file) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "json") {
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : parsed.rows || parsed.data || [];
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  return parseDelimited(await file.text());
}

export function pickField(row, names, fallback = "") {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const direct = row?.[name];
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (found && String(found[1]).trim()) return String(found[1]).trim();
  }
  return fallback;
}

export function downloadTextFile(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
