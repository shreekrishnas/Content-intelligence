// ============================================================
// Bulletproof file parser. Extension-driven with library-based
// parsers for common formats (PDF, DOCX, XLSX). Every parser is
// dynamically imported so the initial bundle stays small.
// The output ALWAYS passes through sanitize() so nothing downstream
// (chunker, Supabase inserts, embeddings) ever sees null bytes,
// lone UTF-16 surrogates, or other Postgres-breaking characters.
// ============================================================

// Bundled worker URL (resolved by Vite at build time — avoids CDN fetch failures)
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

// The 15 most frequent English words — any English text of 1000+ chars will
// contain multiple of these. Garbled font-mapping output virtually never does.
const VERY_COMMON = new Set(['the', 'and', 'of', 'to', 'in', 'is', 'a', 'that', 'for', 'it', 'as', 'are', 'be', 'or', 'an']);

/**
 * Returns true when text is too garbled to be useful — either low printable
 * ratio OR no recognisable English words (typical of broken PDF font encoding).
 * Three independent checks; any one can flag garbled:
 *   1. Printable-char ratio < 70%
 *   2. Fewer than 3 of the 15 most-common English words in 3000 chars
 *   3. Average token length < 2 (mostly single-char glyph IDs)
 */
function isGarbledText(text: string): boolean {
  const sample = text.slice(0, 3000);
  if (!sample || sample.length < 40) return true;

  // Check 1: printable ratio
  let readable = 0;
  let total = 0;
  for (const ch of sample) {
    total++;
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7E) || code === 0x0A || code === 0x0D || code === 0x09) readable++;
    else if (code >= 0x00A0 && code <= 0x024F) readable++;
  }
  if (total > 40 && (readable / total) < 0.7) return true;

  // Check 2: common English word presence
  const tokens = sample.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2);
  if (tokens.length >= 15) {
    const tokenSet = new Set(tokens);
    let hits = 0;
    for (const w of VERY_COMMON) { if (tokenSet.has(w)) hits++; }
    if (hits < 3) return true;
  }

  // Check 3: average token length — real English averages ~4-5 chars/word;
  // glyph-ID garble tends to produce very short tokens
  if (tokens.length >= 10) {
    const avgLen = tokens.reduce((s, w) => s + w.length, 0) / tokens.length;
    if (avgLen < 2.0) return true;
  }

  return false;
}

function finalize(text: string, kind: string): string {
  if (!text || !text.trim()) {
    throw new Error(`No readable text found in ${kind} — the file may be scanned/image-based or password-protected. Please paste the text content manually.`);
  }
  const cleaned = collapseWhitespace(sanitize(text)).slice(0, MAX_OUTPUT_CHARS);
  return cleaned;
}

// ---- Format detection --------------------------------------------------------

type Format = 'txt' | 'md' | 'csv' | 'tsv' | 'json' | 'html' | 'xml' | 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'rtf' | 'pptx' | 'ppt' | 'image' | 'unknown';

function detectFormat(file: File): Format {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.doc') || mime === 'application/msword') return 'doc';
  if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.xls') || mime === 'application/vnd.ms-excel') return 'xls';
  if (name.endsWith('.pptx') || mime.includes('presentationml')) return 'pptx';
  if (name.endsWith('.ppt') || mime === 'application/vnd.ms-powerpoint') return 'ppt';
  if (name.endsWith('.csv') || mime === 'text/csv') return 'csv';
  if (name.endsWith('.tsv') || name.endsWith('.tab')) return 'tsv';
  if (name.endsWith('.json') || mime === 'application/json') return 'json';
  if (name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html') return 'html';
  if (name.endsWith('.xml') || mime.includes('xml')) return 'xml';
  if (name.endsWith('.rtf') || mime === 'application/rtf') return 'rtf';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (mime.startsWith('image/')) return 'image';
  if (/\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(name)) return 'image';
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

    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

    pdfDoc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
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

      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

      pdfDoc = await pdfjs.getDocument({
        data: new Uint8Array(buf),
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
      const viewport = page.getViewport({ scale: 3 }); // 3x = ~216dpi, better OCR accuracy
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

async function ocrImage(file: File, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('Reading image with OCR…');
  const tesseract: any = await import('tesseract.js');
  const worker = await tesseract.createWorker('eng');
  try {
    const bitmapSrc = URL.createObjectURL(file);
    try {
      const { data } = await worker.recognize(bitmapSrc);
      return (data?.text ?? '').trim();
    } finally {
      URL.revokeObjectURL(bitmapSrc);
    }
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
  const map = await extractZipEntries(bytes, (n) => n === 'word/document.xml');
  return map.get('word/document.xml') ?? null;
}

async function extractZipEntries(bytes: Uint8Array, keep: (name: string) => boolean): Promise<Map<string, string>> {
  const decoder = new TextDecoder('utf-8');
  const out = new Map<string, string>();
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b ||
        bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) continue;
    const compMethod = bytes[i + 8]! | (bytes[i + 9]! << 8);
    const compSize = bytes[i + 18]! | (bytes[i + 19]! << 8) | (bytes[i + 20]! << 16) | (bytes[i + 21]! << 24);
    const nameLen = bytes[i + 26]! | (bytes[i + 27]! << 8);
    const extraLen = bytes[i + 28]! | (bytes[i + 29]! << 8);
    const nameStart = i + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (keep(name)) {
      if (compMethod === 0) {
        out.set(name, decoder.decode(bytes.slice(dataStart, dataStart + compSize)));
      } else if (compMethod === 8) {
        const end = compSize > 0 ? dataStart + compSize : Math.min(dataStart + 20 * 1024 * 1024, bytes.length);
        const inflated = await inflateRaw(bytes.slice(dataStart, end));
        if (inflated) out.set(name, decoder.decode(inflated));
      }
    }
    // Advance past this entry to keep scanning for more matches.
    if (compSize > 0) {
      i = dataStart + compSize - 1; // -1 because loop will ++
    }
  }
  return out;
}

// ---- PPTX (PowerPoint) via primitive ZIP + XML strip -------------------------

async function parsePptx(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await extractZipEntries(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  if (entries.size === 0) return '';
  const slideNames = Array.from(entries.keys()).sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
    const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
    return na - nb;
  });
  const parts: string[] = [];
  for (let idx = 0; idx < slideNames.length; idx++) {
    const xml = entries.get(slideNames[idx]!) ?? '';
    const text = xml
      .replace(/<a:tab[^>]*\/?>/g, '\t')
      .replace(/<a:br[^>]*\/?>/g, '\n')
      .replace(/<\/a:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (text) parts.push(`# Slide ${idx + 1}\n${text}`);
  }
  return parts.join('\n\n');
}

// ---- Legacy .doc — extract printable-ASCII runs from the binary --------------

async function parseLegacyDoc(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Look for runs of printable text. Old .doc files store text as UTF-16LE in
  // the WordDocument stream; a byte-level scan for readable runs recovers most
  // prose, which is good enough for a knowledge base.
  const chunks: string[] = [];
  let run = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const lo = bytes[i]!;
    const hi = bytes[i + 1]!;
    if (hi === 0 && ((lo >= 0x20 && lo <= 0x7E) || lo === 0x0A || lo === 0x0D || lo === 0x09)) {
      run += String.fromCharCode(lo);
    } else {
      if (run.length >= 4) chunks.push(run);
      run = '';
    }
  }
  if (run.length >= 4) chunks.push(run);
  // Fall back to single-byte scan if UTF-16LE produced nothing.
  if (chunks.length === 0) {
    let single = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if ((b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09) {
        single += String.fromCharCode(b);
      } else {
        if (single.length >= 6) chunks.push(single);
        single = '';
      }
    }
    if (single.length >= 6) chunks.push(single);
  }
  return chunks.join('\n').trim();
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
  xlsx: 'Excel spreadsheet', xls: 'legacy .xls',
  pptx: 'PowerPoint', ppt: 'legacy .ppt',
  csv: 'CSV', tsv: 'TSV',
  json: 'JSON', html: 'HTML', xml: 'XML', rtf: 'RTF', md: 'Markdown',
  image: 'image',
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
        text = await parseLegacyDoc(file);
        break;
      case 'xlsx':
      case 'xls':
        text = await parseSpreadsheet(file);
        break;
      case 'pptx':
        text = await parsePptx(file);
        break;
      case 'ppt':
        text = await parseLegacyDoc(file); // same binary-scan strategy
        break;
      case 'image':
        text = await ocrImage(file, onProgress);
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
        throw new Error(`${file.name}: unsupported file type. Supported: PDF, DOCX, PPTX, XLSX, CSV, images (JPG/PNG), and text formats.`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes(':')) throw e; // preserve our tailored message
    throw new Error(`${file.name}: failed to parse as ${FRIENDLY_TYPE[format]} — ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  return finalize(text, FRIENDLY_TYPE[format]);
}
