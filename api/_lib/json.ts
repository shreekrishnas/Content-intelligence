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
  throw new Error('The model returned a response that could not be parsed as JSON.');
}
