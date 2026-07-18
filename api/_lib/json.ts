// A response that hits maxTokens stops mid-generation — valid JSON up to
// that point, then nothing. Walk the text tracking open strings/brackets and
// close whatever's still open, so a cut-off response still parses instead of
// failing outright. Heuristic, not a general JSON repair tool: it only
// handles "generation stopped partway through," which is the actual failure
// mode here (confirmed by responses that trail off mid-word).
function closeTruncatedJSON(text: string): string {
  let out = text;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of out) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (inString) out += '"';

  // A dangling comma/colon right before we close things off is invalid JSON
  // ("foo": ,} or "foo",}) — trim it before appending closers.
  out = out.replace(/[,:]\s*$/, '');

  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']';
  }
  return out;
}

export function extractJSON(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json|javascript|js)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* try object/array extraction */ }
  const candidates: Array<[number, number]> = [];
  const ob = stripped.indexOf('{'); const cb = stripped.lastIndexOf('}');
  if (ob !== -1 && cb > ob) candidates.push([ob, cb]);
  const oa = stripped.indexOf('['); const ca = stripped.lastIndexOf(']');
  if (oa !== -1 && ca > oa) candidates.push([oa, ca]);
  for (const [s, e] of candidates) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* next */ }
  }
  // Nothing balanced parsed — likely truncated mid-structure. Try repairing
  // from wherever the JSON actually starts.
  const start = ob !== -1 ? ob : oa;
  if (start !== -1) {
    try { return JSON.parse(closeTruncatedJSON(stripped.slice(start))); } catch { /* give up */ }
  }
  throw new Error('The model returned a response that could not be parsed as JSON.');
}
