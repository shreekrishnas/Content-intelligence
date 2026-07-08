export interface Chunk {
  content: string;
  index: number;
  charStart: number;
  charEnd: number;
}

const CHARS_PER_TOKEN = 4;

export function chunkText(
  text: string,
  targetTokens = 600,
  overlapPct = 0.15,
): Chunk[] {
  if (!text.trim()) return [];

  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = Math.round(targetChars * overlapPct);

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const blocks: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= targetChars) {
      blocks.push(para.trim());
    } else {
      const sentences = para.match(/[^.!?]+[.!?]+[\s]*/g) ?? [para];
      for (const s of sentences) {
        blocks.push(s.trim());
      }
    }
  }

  const chunks: Chunk[] = [];
  let buf = '';
  let bufStart = 0;
  let cursor = 0;

  const flush = () => {
    if (!buf.trim()) return;
    chunks.push({
      content: buf.trim(),
      index: chunks.length,
      charStart: bufStart,
      charEnd: bufStart + buf.trimEnd().length,
    });
  };

  for (const block of blocks) {
    const blockStart = text.indexOf(block, cursor);
    if (blockStart !== -1) cursor = blockStart;

    if (buf.length + block.length + 1 > targetChars && buf.length > 0) {
      flush();

      // Keep the tail of the previous buffer as overlap
      const tail = buf.slice(-overlapChars);
      const tailOffset = bufStart + buf.length - tail.length;
      buf = tail + '\n\n' + block;
      bufStart = tailOffset;
    } else {
      if (buf.length === 0) {
        bufStart = blockStart !== -1 ? blockStart : cursor;
        buf = block;
      } else {
        buf += '\n\n' + block;
      }
    }
  }

  flush();
  return chunks;
}
