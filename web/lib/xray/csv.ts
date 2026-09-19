export interface CsvPreviewResult {
  headers: string[];
  rows: string[][];
  byteLength: number;
  truncated: boolean;
}

const PREVIEW_BYTES = 64 * 1024;
const MAX_ROWS = 5;

/** Minimal CSV line splitter — handles quotes and CRLF. */
export function parseCsvChunk(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }

  // Trailing field without newline — only keep if we have a complete-looking row
  // or if the chunk ended mid-row (truncated), drop the incomplete last row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    // If truncated mid-line, last row is incomplete — caller may drop it
    rows.push(row);
  }

  return rows;
}

function readBlobPrefixAsText(file: File, maxBytes: number): Promise<string> {
  const blob = file.slice(0, maxBytes);
  // Real browsers: Blob.arrayBuffer / .text. jsdom: FileReader.
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buf) => new TextDecoder("utf-8").decode(buf));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsText(blob);
  });
}

/**
 * Read only the first 64KB of a File — works with 450MB CSVs in the browser.
 */
export async function readCsvPreview(
  file: File,
  maxBytes = PREVIEW_BYTES,
  maxRows = MAX_ROWS
): Promise<CsvPreviewResult> {
  const text = await readBlobPrefixAsText(file, maxBytes);
  const truncated = file.size > maxBytes;
  const parsed = parseCsvChunk(text);

  if (parsed.length === 0) {
    return { headers: [], rows: [], byteLength: file.size, truncated };
  }

  const headers = parsed[0]!.map((h) => h.trim());
  let dataRows = parsed.slice(1);

  // Drop incomplete last row when truncated
  if (truncated && dataRows.length > 0) {
    dataRows = dataRows.slice(0, -1);
  }

  return {
    headers,
    rows: dataRows.slice(0, maxRows),
    byteLength: file.size,
    truncated,
  };
}
