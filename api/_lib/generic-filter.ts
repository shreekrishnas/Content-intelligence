// Deterministic backstop against generic LLM output — a model can ignore
// prompt instructions, so anything that survives generation is re-checked
// here. This is the hard filter; the system prompts are the soft ask.

export const GENERIC_PATTERNS: RegExp[] = [
  /\b(the )?(growing|rising|increasing) (importance|demand|focus|adoption|need|popularity) (of|for|in)\b/i,
  /\b(the )?(rise|future|evolution) of\b/i,
  /\bis (transforming|reshaping|revolutionizing|disrupting) the\b/i,
  /\bleveraging (ai|technology|data|automation) (for|to)\b/i,
  /\bwhy .+ matters\b/i,
  /\bthe (power|importance) of\b/i,
  /\bunlocking the (potential|power) of\b/i,
  /\b(embracing|navigating) (the )?(digital|ai|technology)\b/i,
  /\bstaying ahead (of|in)\b/i,
  /\bthe (ultimate|complete) guide to\b/i,
  /\beverything you need to know about\b/i,
  /\btop \d+ (tips|ways|reasons) (for|to)\b/i,
];

export function isGenericText(...texts: Array<string | undefined>): boolean {
  const combined = texts.filter(Boolean).join(' ');
  if (!combined) return false;
  return GENERIC_PATTERNS.some((re) => re.test(combined));
}

// A specific claim names something: a proper noun (capitalized multi-word
// run), a year/date, or a number. Absence of all three is a strong generic
// signal — used as a secondary check alongside the phrase denylist.
export function hasConcreteAnchor(...texts: Array<string | undefined>): boolean {
  const combined = texts.filter(Boolean).join(' ');
  if (!combined) return false;
  const hasProperNoun = /\b[A-Z][a-zA-Z0-9&.]+(?:\s+[A-Z][a-zA-Z0-9&.]+)+\b/.test(combined);
  const hasNumberOrDate = /\b(20\d{2}|\d+%|\bQ[1-4]\b|₹|\$\d|\d+\s*(crore|lakh|million|billion))\b/i.test(combined);
  return hasProperNoun || hasNumberOrDate;
}
