export interface DomainProfile {
  website_url?: string;
  business_name?: string;
  industry?: string;
  products?: string;
  services?: string;
  core_topics?: string;
  // Comma/newline-separated list of 4-6 content pillars within the niche.
  // Used for per-pillar relevance scoring and bridge targeting. Takes
  // precedence over core_topics when both are present.
  niche_pillars?: string;
  target_keywords?: string;
  target_locations?: string;
  target_audience?: string;
  audience_sophistication?: 'beginner' | 'intermediate' | 'expert';
  business_goals?: string;
  content_categories?: string;
  brand_tone?: string;
  restricted_topics?: string;
  competitors?: string;
  allowed_formats?: string;
  max_recommendations?: number;
  risk_tolerance?: string;
  enabled?: boolean;
  // Regulatory body or compliance domain (e.g. "SEBI", "FDA", "FCA", null).
  // When set, all output topics get a compliance_flag if they touch regulated areas.
  compliance_domain?: string;
  // News velocity of the niche — calibrates scan window and query aggression.
  niche_velocity?: 'fast' | 'medium' | 'slow';
  // Comma/newline-separated list of preferred news domains for reactive
  // queries (e.g. "moneycontrol.com, livemint.com, ndtv.com"). When set,
  // Tavily searches for this account only surface results from these
  // outlets. When blank, we fall back to a curated Indian news default.
  preferred_news_domains?: string;
}

export interface TrendSignal {
  topic?: string;
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  published_at?: string;
  content?: string;
  score?: number;
  // Raw mention count from source for velocity proxy
  mention_count?: number;
  // 'reactive' = this-week news, good for newsjacking. 'strategic' = a
  // durable multi-month shift (regulatory phase-in, market report, seasonal
  // category) worth planning a content pillar around. Set at collection
  // time as a hint — the supervisor makes the final call per topic.
  horizon?: 'reactive' | 'strategic';
  // Trend-jacking metadata. When 'viral_bridged', the signal originated
  // outside the brand's niche and was creatively connected via the bridge
  // layer — the supervisor should preserve bridge_angle/underlying_theme on
  // the output topic so the UI can flag it as a trend-jack.
  signal_type?: 'niche' | 'viral_bridged';
  bridge_angle?: string;
  underlying_theme?: string;
  bridge_confidence?: 'natural_fit' | 'creative_stretch';
  sensitivity_warning?: string;
}

export interface FileContext {
  id: string;
  file_name: string;
  category: string;
  priority: string;
  content: string;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
}
