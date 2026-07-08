export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return file.text();
  }

  if (name.endsWith('.csv')) {
    return file.text();
  }

  if (name.endsWith('.pdf')) {
    return extractPdfText(await file.arrayBuffer());
  }

  if (name.endsWith('.docx')) {
    return extractDocxText(await file.arrayBuffer());
  }

  return `[Unsupported format: ${file.name}] — paste the text content manually.`;
}

// Best-effort PDF text extraction without external libraries.
// Looks for text operands in the content stream: strings inside parentheses
// (literal strings) and hex strings inside angle brackets. Handles common
// escape sequences. Complex PDFs (scanned images, CIDFont CMap streams) will
// hit the fallback.
function extractPdfText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const raw = new TextDecoder('latin1').decode(bytes);

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
          else if (raw[i] === '(' || raw[i] === ')' || raw[i] === '\\')
            lit += raw[i];
          else lit += raw[i];
        } else if (raw[i] === '(') {
          depth++;
          lit += '(';
        } else if (raw[i] === ')') {
          depth--;
          if (depth > 0) lit += ')';
        } else {
          lit += raw[i];
        }
        i++;
      }
      if (lit.trim()) lines.push(lit);
    } else {
      i++;
    }
  }

  if (lines.length === 0) {
    return '[Could not extract text from this PDF — it may be scanned/image-based. Please paste the text content manually.]';
  }

  return lines.join(' ').replace(/\s{2,}/g, ' ').trim();
}

// Minimal DOCX extraction: docx files are ZIP archives containing XML.
// We look for the word/document.xml entry and strip tags.
async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  try {
    const bytes = new Uint8Array(buf);
    const xmlContent = findDocxXml(bytes);
    if (!xmlContent) {
      return '[Could not parse DOCX — please paste the text content manually.]';
    }
    // Strip XML tags, decode basic entities
    return xmlContent
      .replace(/<\/w:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '[Could not parse DOCX — please paste the text content manually.]';
  }
}

// Locate word/document.xml inside a ZIP (DOCX) without a zip library.
// Scans for the local file header signature and filename match.
function findDocxXml(bytes: Uint8Array): string | null {
  const target = 'word/document.xml';
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < bytes.length - 30; i++) {
    // ZIP local file header: PK\x03\x04
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b ||
        bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) continue;

    const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const extraLen = bytes[i + 28] | (bytes[i + 29] << 8);
    const compMethod = bytes[i + 8] | (bytes[i + 9] << 8);
    const compSize = bytes[i + 18] | (bytes[i + 19] << 8) |
                     (bytes[i + 20] << 16) | (bytes[i + 21] << 24);

    const nameStart = i + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
    if (name !== target) continue;

    // Only handle stored (uncompressed) entries
    if (compMethod !== 0) return null;

    const dataStart = nameStart + nameLen + extraLen;
    return decoder.decode(bytes.slice(dataStart, dataStart + compSize));
  }

  return null;
}
