/* ------------------------------------------------------------------ */
/*  Source types for content analysis                                   */
/* ------------------------------------------------------------------ */

export interface SourceTypeConfig {
  key: string;
  label: string;
  formats: string[];
}

export const SOURCE_TYPES: SourceTypeConfig[] = [
  {
    key: "et_video",
    label: "ET Video",
    formats: ["LinkedIn carousel", "Short-form video script", "Blog post", "Newsletter snippet"],
  },
  {
    key: "author_blog",
    label: "Author Blog",
    formats: ["LinkedIn post", "Twitter thread", "Newsletter deep-dive", "Infographic brief"],
  },
  {
    key: "weekly_anil_rachana",
    label: "Weekly Anil Rachana",
    formats: ["LinkedIn thought-leadership post", "Short video script", "Carousel", "Quote card"],
  },
  {
    key: "webinar",
    label: "Webinar",
    formats: ["Blog recap", "LinkedIn carousel", "Email drip", "Social quote cards"],
  },
  {
    key: "event_workshop",
    label: "Event / Workshop",
    formats: ["Recap blog", "Photo carousel", "Attendee testimonial post", "Follow-up email"],
  },
  {
    key: "trending_topic",
    label: "Trending Topic",
    formats: ["Hot-take LinkedIn post", "Thread", "Short video script", "Newsletter tie-in"],
  },
];

/* ------------------------------------------------------------------ */
/*  Knowledge base categories                                          */
/* ------------------------------------------------------------------ */

export interface KBCategoryConfig {
  key: string;
  label: string;
  description: string;
}

export const KB_CATEGORIES: KBCategoryConfig[] = [
  { key: "persona", label: "Persona", description: "Target audience profiles and demographics" },
  { key: "brand", label: "Brand", description: "Brand voice, tone, and style guidelines" },
  { key: "compliance", label: "Compliance", description: "Legal, regulatory, and compliance rules" },
  { key: "terminology", label: "Terminology", description: "Domain-specific terms and definitions" },
  { key: "expert", label: "Expert", description: "Subject-matter expert notes and references" },
  { key: "guidelines", label: "Guidelines", description: "Content creation guidelines and standards" },
  { key: "raw_notes", label: "Raw Notes", description: "Unstructured notes and meeting transcripts" },
  { key: "data", label: "Data", description: "Datasets, statistics, and research findings" },
  { key: "idea", label: "Idea", description: "Content ideas and brainstorming notes" },
];

/* ------------------------------------------------------------------ */
/*  Analysis activity / progress labels                                */
/* ------------------------------------------------------------------ */

export const ACTIVITY_LABELS: string[] = [
  "Parsing source content...",
  "Extracting key topics...",
  "Matching personas...",
  "Running depth analysis...",
  "Identifying opportunities...",
  "Cross-referencing knowledge base...",
  "Grounding with sources...",
  "Running quality checks...",
  "Generating final report...",
];

/* ------------------------------------------------------------------ */
/*  Default integrations                                               */
/* ------------------------------------------------------------------ */

export interface DefaultIntegration {
  type: string;
  provider: string;
  label: string;
  description: string;
}

export const DEFAULT_INTEGRATIONS: DefaultIntegration[] = [
  {
    type: "cms",
    provider: "wordpress",
    label: "WordPress",
    description: "Publish content directly to WordPress sites",
  },
  {
    type: "social",
    provider: "linkedin",
    label: "LinkedIn",
    description: "Schedule and publish LinkedIn posts",
  },
  {
    type: "social",
    provider: "twitter",
    label: "Twitter / X",
    description: "Schedule and publish tweets and threads",
  },
  {
    type: "email",
    provider: "mailchimp",
    label: "Mailchimp",
    description: "Push newsletter content to Mailchimp campaigns",
  },
  {
    type: "analytics",
    provider: "google_analytics",
    label: "Google Analytics",
    description: "Track content performance metrics",
  },
  {
    type: "storage",
    provider: "google_drive",
    label: "Google Drive",
    description: "Import and export content from Google Drive",
  },
];
