// Client-side archetype detector — mirrors lib/source-archetypes.ts so
// the UI can preview which archetype will be applied before running.
// Keep patterns in sync with the server.

const PATTERNS: Array<[string, RegExp]> = [
  ['Customer interview', /interview|testimonial|customer[_ -]story|case[_ -]study|cx|voice[_ -]of[_ -]customer/i],
  ['Webinar / Masterclass', /webinar|masterclass|workshop/i],
  ['Event / Panel', /event|conference|summit|panel|expo|meetup|gala/i],
  ['Product launch', /launch|announcement|release|product[_ -]update|changelog|feature[_ -]drop/i],
  ['Competitor content', /competitor|rival|alternative[_ -]to/i],
  ['Research / Report', /research|report|whitepaper|study|survey|benchmark|state[_ -]of|market[_ -]analysis|data/i],
  ['Trending topic', /trend|news|breaking|hot[_ -]topic|current|viral/i],
  ['Recurring / Newsletter', /weekly|monthly|daily|newsletter|digest|roundup|recap[_ -]series/i],
  ['Video / Podcast', /video|podcast|transcript|episode|reel|short|youtube|clip|et[_ -]video|voice[_ -]page/i],
  ['Blog / Article', /blog|article|op[_ -]ed|essay|column|post|substack|medium|author/i],
];

export function archetypeHint(name?: string, slug?: string): string | null {
  const haystack = `${slug ?? ''} ${name ?? ''}`.toLowerCase();
  if (!haystack.trim()) return null;
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(haystack)) return label;
  }
  return null;
}
