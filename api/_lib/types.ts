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
