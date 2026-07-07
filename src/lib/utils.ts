/**
 * Generate a random ID with an optional prefix.
 *
 * @example uid("kf") // "kf_a3b7c9d2"
 */
export function uid(prefix = ""): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return prefix ? `${prefix}_${hex}` : hex;
}

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * HTML-escape a string to prevent XSS when rendering raw text.
 */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC_MAP[ch] ?? ch);
}

/**
 * Join class names, filtering out falsy values.
 *
 * @example cn("btn", isPrimary && "btn-primary", undefined) // "btn btn-primary"
 */
export function cn(
  ...classes: (string | false | undefined | null)[]
): string {
  return classes.filter(Boolean).join(" ");
}
