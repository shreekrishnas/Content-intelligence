// ============================================================
// Bulletproof file parser. Extension-driven with library-based
// parsers for common formats (PDF, DOCX, XLSX). Every parser is
// dynamically imported so the initial bundle stays small.
// The output ALWAYS passes through sanitize() so nothing downstream
// (chunker, Supabase inserts, embeddings) ever sees null bytes,
// lone UTF-16 surrogates, or other Postgres-breaking characters.
// ============================================================

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB safety cap
const MAX_OUTPUT_CHARS = 500_000; // ~125k tokens — plenty for chunking

/**
 * Strip characters Postgres / JSON serialisers refuse:
 *   \x00 and other C0 control chars (keep tab / newline / CR)
 *   lone UTF-16 surrogates
 */
function sanitize(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1');
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Heuristic to detect garbled PDF text extraction. PDFs with custom font
 * encodings produce "text" that is technically non-empty but is gibberish
 * (high ratio of non-ASCII, control-like, or uncommon Unicode chars).
 * Catches the problem at upload time instead of storing garbage chunks.
 */
function isGarbledText(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (!sample) return true;
  let readable = 0;
  let total = 0;
  for (const ch of sample) {
    total++;
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7E) || code === 0x0A || code === 0x0D || code === 0x09) {
      readable++;
    } else if (code >= 0x00A0 && code <= 0x024F) {
      readable++;
    }
  }
  return total > 50 && (readable / total) < 0.7;
}

function finalize(text: string, kind: string): string {
  if (!text || !text.trim()) {
    throw new Error(`No readable text found in ${kind} — the file may be scanned/image-based or password-protected. Please paste the text content manually.`);
  }
  const cleaned = collapseWhitespace(sanitize(text)).slice(0, MAX_OUTPUT_CHARS);
  return cleaned;
}

// ---- Format detection --------------------------------------------------------

type Format = 'txt' | 'md' | 'csv' | 'tsv' | 'json' | 'html' | 'xml' | 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'rtf' | 'unknown';

function detectFormat(file: File): Format {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.xls') || mime === 'application/vnd.ms-excel') return 'xls';
  if (name.endsWith('.csv') || mime === 'text/csv') return 'csv';
  if (name.endsWith('.tsv') || name.endsWith('.tab')) return 'tsv';
  if (name.endsWith('.json') || mime === 'application/json') return 'json';
  if (name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html') return 'html';
  if (name.endsWith('.xml') || mime.includes('xml')) return 'xml';
  if (name.endsWith('.rtf') || mime === 'application/rtf') return 'rtf';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (name.endsWith('.txt') || name.endsWith('.log') || mime.startsWith('text/')) return 'txt';
  return 'unknown';
}

// ---- Individual parsers ------------------------------------------------------

async function parsePlainText(file: File): Promise<string> {
  return await file.text();
}

async function parseCsvLike(file: File, delimiter: ',' | '\t'): Promise<string> {
  const raw = await file.text();
  // Convert to a readable line-per-row form: "col1 | col2 | col3"
  return raw
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

async function parseJson(file: File): Promise<string> {
  const raw = await file.text();
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw; // malformed — return as-is so chunker still gets something
  }
}

async function parseHtml(file: File): Promise<string> {
  const raw = await file.text();
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function parseXml(file: File): Promise<string> {
  const raw = await file.text();
  return raw.replace(/<[^>]+>/g, ' ');
}

async function parseRtf(file: File): Promise<string> {
  const raw = await file.text();
  // Strip RTF control words and groups
  return raw
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'[0-9a-f]{2}/gi, '') // hex-encoded chars — drop rather than misdecode
    .replace(/\\u-?\d+\??/g, '') // Unicode escapes
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

// ---- PDF via pdfjs-dist (lazy import) ---------------------------------------
// Strategy: try text extraction first (fast). If the result is empty OR garbled
// (custom font encodings that don't map to real Unicode), fall back to OCR by
// rendering each page to a canvas and reading it with Tesseract. That way ANY
// PDF works — text-based, image-based, or broken font encoding — the user
// never has to know or care which kind they uploaded.

async function parsePdf(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const buf = await file.arrayBuffer();
  let pdfDoc: any = null;
  let extractedText = '';

  try {
    const pdfjs: any = await import('pdfjs-dist');
    pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
      isEvalSupported: false,
    }).promise;

    const pages: string[] = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as any[]).map((it) => it.str ?? '').filter(Boolean);
      if (items.length) pages.push(items.join(' '));
    }
    extractedText = pages.join('\n\n');
  } catch {
    // fall through
  }

  // If text extraction worked and produced readable content, use it.
  const cleaned = collapseWhitespace(sanitize(extractedText));
  if (cleaned && !isGarbledText(cleaned)) return extractedText;

  // Try the primitive scanner as a second attempt (works for some simple PDFs).
  const primitive = primitivePdfText(buf);
  const primitiveCleaned = collapseWhitespace(sanitize(primitive));
  if (primitiveCleaned && primitiveCleaned.length > 200 && !isGarbledText(primitiveCleaned)) {
    return primitive;
  }

  // Text extraction failed or produced garbage — OCR the rendered pages.
  if (!pdfDoc) {
    try {
      const pdfjs: any = await import('pdfjs-dist');
      pdfDoc = await pdfjs.getDocument({
        data: new Uint8Array(buf),
        disableWorker: true,
        isEvalSupported: false,
      }).promise;
    } catch (e) {
      throw new Error(`PDF could not be opened: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  onProgress?.('Text extraction failed — running OCR (this may take a minute)…');
  return await ocrPdf(pdfDoc, onProgress);
}

async function ocrPdf(pdfDoc: any, onProgress?: (msg: string) => void): Promise<string> {
  const tesseract: any = await import('tesseract.js');
  const numPages = Math.min(pdfDoc.numPages, 50); // safety cap on very long PDFs
  const worker = await tesseract.createWorker('eng');
  try {
    const pageTexts: string[] = [];
    for (let p = 1; p <= numPages; p++) {
      onProgress?.(`OCR page ${p} of ${numPages}…`);
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 2 }); // 2x for sharper OCR
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      const text = (data?.text ?? '').trim();
      if (text) pageTexts.push(text);
    }
    return pageTexts.join('\n\n');
  } finally {
    await worker.terminate().catch(() => {});
  }
}

function primitivePdfText(buf: ArrayBuffer): string {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buf));
  const lines: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '(') {
      let depth = 1;
      let lit = '';
      i++;
      while (i < raw.length && depth > 0) {
        if (raw[i] === '\\') {
          i++;
          if (raw[i] === 'n') lit += '\n';
          else if (raw[i] === 'r') lit += '\r';
          else if (raw[i] === 't') lit += '\t';
          else lit += raw[i] ?? '';
        } else if (raw[i] === '(') { depth++; lit += '('; }
        else if (raw[i] === ')') { depth--; if (depth > 0) lit += ')'; }
        else { lit += raw[i]; }
        i++;
      }
      if (lit.trim()) lines.push(lit);
    } else { i++; }
  }
  return lines.join(' ').replace(/\s{2,}/g, ' ').trim();
}

// ---- DOCX via mammoth (lazy import) ------------------------------------------

async function parseDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const mammoth: any = await import(/* @vite-ignore */ 'mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    if (result?.value?.trim()) return result.value;
  } catch { /* fall through */ }
  // Fallback: primitive ZIP + XML strip
  return await primitiveDocxText(buf);
}

async function primitiveDocxText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const xml = await findDocxXml(bytes);
  if (!xml) return '';
  return xml
    .replace(/<w:tab[^>]*\/?>/g, '\t')
    .replace(/<w:br[^>]*\/?>/g, '\n')
    .replace(/<\/w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  } catch { return null; }
}

async function findDocxXml(bytes: Uint8Array): Promise<string | null> {
  const target = 'word/document.xml';
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b ||
        bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) continue;
    const compMethod = bytes[i + 8]! | (bytes[i + 9]! << 8);
    const compSize = bytes[i + 18]! | (bytes[i + 19]! << 8) | (bytes[i + 20]! << 16) | (bytes[i + 21]! << 24);
    const nameLen = bytes[i + 26]! | (bytes[i + 27]! << 8);
    const extraLen = bytes[i + 28]! | (bytes[i + 29]! << 8);
    const nameStart = i + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    if (name !== target) continue;
    const dataStart = nameStart + nameLen + extraLen;
    if (compMethod === 0) return decoder.decode(bytes.slice(dataStart, dataStart + compSize));
    if (compMethod === 8) {
      const end = compSize > 0 ? dataStart + compSize : bytes.length;
      const inflated = await inflateRaw(bytes.slice(dataStart, end));
      if (inflated) return decoder.decode(inflated);
    }
    return null;
  }
  return null;
}

// ---- XLSX / XLS via SheetJS (lazy import) ------------------------------------

async function parseSpreadsheet(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const xlsx: any = await import('xlsx');
    const wb = xlsx.read(new Uint8Array(buf), { type: 'array' });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows: string[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
      if (!rows.length) continue;
      parts.push(`# ${sheetName}`);
      for (const row of rows) {
        const line = row.map((c: any) => (c == null ? '' : String(c).trim())).filter(Boolean).join(' | ');
        if (line) parts.push(line);
      }
      parts.push('');
    }
    return parts.join('\n');
  } catch (e) {
    throw new Error(`Failed to parse spreadsheet: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
}

// ---- Public entrypoint -------------------------------------------------------

const FRIENDLY_TYPE: Record<Format, string> = {
  pdf: 'PDF', docx: 'Word document', doc: 'legacy .doc',
  xlsx: 'Excel spreadsheet', xls: 'legacy .xls', csv: 'CSV', tsv: 'TSV',
  json: 'JSON', html: 'HTML', xml: 'XML', rtf: 'RTF', md: 'Markdown',
  txt: 'text file', unknown: 'file',
};

export async function parseFile(file: File, onProgress?: (msg: string) => void): Promise<string> {
  if (file.size === 0) throw new Error(`${file.name}: file is empty.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`);

  const format = detectFormat(file);
  let text = '';

  try {
    switch (format) {
      case 'txt':
      case 'md':
        text = await parsePlainText(file);
        break;
      case 'csv':
        text = await parseCsvLike(file, ',');
        break;
      case 'tsv':
        text = await parseCsvLike(file, '\t');
        break;
      case 'json':
        text = await parseJson(file);
        break;
      case 'html':
        text = await parseHtml(file);
        break;
      case 'xml':
        text = await parseXml(file);
        break;
      case 'rtf':
        text = await parseRtf(file);
        break;
      case 'pdf':
        text = await parsePdf(file, onProgress);
        break;
      case 'docx':
        text = await parseDocx(file);
        break;
      case 'doc':
        throw new Error(`${file.name}: legacy .doc format is not supported. Re-save as .docx and try again.`);
      case 'xlsx':
      case 'xls':
        text = await parseSpreadsheet(file);
        break;
      case 'unknown':
      default: {
        // Last resort — treat as text.
        try {
          const raw = await file.text();
          if (raw && /[\x20-\x7E]/.test(raw)) {
            text = raw;
            break;
          }
        } catch { /* fall through */ }
        throw new Error(`${file.name}: unsupported file type. Supported: PDF, DOCX, XLSX/XLS, CSV, TSV, JSON, HTML, XML, RTF, TXT, MD.`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes(':')) throw e; // preserve our tailored message
    throw new Error(`${file.name}: failed to parse as ${FRIENDLY_TYPE[format]} — ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  return finalize(text, FRIENDLY_TYPE[format]);
}
