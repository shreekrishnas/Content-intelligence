export interface DomainProfile {
  website_url?: string;
  business_name?: string;
  industry?: string;
  products?: string;
  services?: string;
  core_topics?: string;
  target_keywords?: string;
  target_locations?: string;
  target_audience?: string;
  business_goals?: string;
  content_categories?: string;
  brand_tone?: string;
  restricted_topics?: string;
  competitors?: string;
  allowed_formats?: string;
  max_recommendations?: number;
  risk_tolerance?: string;
  enabled?: boolean;
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
