/* ------------------------------------------------------------------ */
/*  Core entities                                                      */
/* ------------------------------------------------------------------ */

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  status: "active" | "paused" | "archived";
  profile: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  name: string | null;
  email: string;
  is_org_admin: boolean;
  td_role: string | null;
  created_at: string;
}

export interface AccountAccess {
  user_id: string;
  account_id: string;
  role: "manager" | "editor" | "viewer";
}

/* ------------------------------------------------------------------ */
/*  Knowledge base                                                     */
/* ------------------------------------------------------------------ */

export type KnowledgeCategory =
  | "persona"
  | "brand"
  | "compliance"
  | "terminology"
  | "expert"
  | "guidelines"
  | "raw_notes"
  | "data"
  | "idea";

export type Priority = "critical" | "high" | "standard" | "low";

export interface KnowledgeFile {
  id: string;
  account_id: string;
  file_name: string;
  category: KnowledgeCategory;
  priority: Priority;
  source_type: "file" | "paste" | "url";
  storage_url: string | null;
  active: boolean;
  version: number;
  structured: Record<string, any>;
  ingest_status: "pending" | "processing" | "ready" | "failed";
  uploaded_by: string | null;
  created_at: string;
}

export interface KnowledgeChunk {
  id: string;
  file_id: string;
  account_id: string;
  chunk_text: string;
  embed_model: string;
  token_count: number | null;
  position: number | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Analysis                                                           */
/* ------------------------------------------------------------------ */

export interface AnalysisResult {
  summary: string;
  topics: string[];
  insights: Array<{
    text: string;
    confidence: string;
    source_reference: string;
  }>;
  persona_matches: Array<{
    persona_name: string;
    relevance_score: number;
    matching_points: string[];
    suggested_angle: string;
  }>;
  depth_analysis: Array<{
    topic: string;
    depth: string;
    key_points: string[];
    gaps: string[];
  }>;
  opportunities: Array<{
    title: string;
    content_angle: string;
    recommended_format: string;
    priority: string;
    persona_match: string;
    suggested_cta: string;
    source_context: string;
  }>;
  quality_check: {
    source_richness: string;
    actionability: string;
    uniqueness: string;
    completeness: string;
  };
  warnings: string[];
}

export interface Analysis {
  id: string;
  account_id: string;
  source_text: string;
  source_type: string;
  result: AnalysisResult;
  created_by: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Content pipeline                                                   */
/* ------------------------------------------------------------------ */

export interface Opportunity {
  id: string;
  account_id: string;
  analysis_id: string | null;
  title: string;
  persona_file_id: string | null;
  content_angle: string | null;
  format: string | null;
  status: "open" | "in_studio" | "dropped";
  priority: string | null;
  persona_name: string | null;
  persona_relevance_score: number | null;
  recommendation_reason: string | null;
  timeliness: string | null;
  suggested_cta: string | null;
  source_context: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Asset {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  stage: "outline" | "draft" | "approved" | "scheduled" | "published";
  body: string | null;
  quality: Record<string, any>;
  grounded_chunk_ids: string[];
  confirmed_source_ids: string[];
  feedback_log: any[];
  created_by: string | null;
  created_at: string;
}

export interface CalendarItem {
  id: string;
  account_id: string;
  asset_id: string | null;
  title: string | null;
  format: string | null;
  scheduled_for: string | null;
  status: "scheduled" | "published" | "cancelled";
  body: string | null;
  quality?: Record<string, any>;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Integrations & audit                                               */
/* ------------------------------------------------------------------ */

export interface Integration {
  id: string;
  account_id: string;
  type: string;
  provider: string | null;
  credentials_ref: string | null;
  status: string;
  config: Record<string, any>;
}

export interface SourceType {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  description: string;
  formats: string[];
  analysis_guidance?: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Trend Supervisor                                                   */
/* ------------------------------------------------------------------ */

export interface TrendProfile {
  enabled?: boolean;
  website_url?: string;
  business_name?: string;
  industry?: string;
  products?: string;
  services?: string;
  core_topics?: string;
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
  compliance_domain?: string;
  niche_velocity?: 'fast' | 'medium' | 'slow';
  preferred_news_domains?: string;
}

export interface TrendRecord {
  id: string;
  account_id: string;
  scan_id: string | null;
  topic: string;
  summary: string;
  classification: "domain_trend" | "supertrend_exception" | "monitor" | "reject";
  time_horizon?: "reactive" | "strategic";
  domain_relevance_score: number;
  trend_impact_score: number;
  adaptability_score: number;
  risk_score: number;
  confidence_score: number;
  priority: string;
  trend_stage: string;
  estimated_lifespan: string;
  recommended_route: string;
  reason: string;
  suggested_connection: string;
  recommended_formats: string[];
  related_keywords: string[];
  source_signals: Array<{ title?: string; url?: string; source?: string }>;
  needs_human_review?: boolean;
  content_angle?: string;
  signal_type?: "niche" | "viral_bridged";
  bridge_angle?: string;
  underlying_theme?: string;
  bridge_confidence?: "natural_fit" | "creative_stretch" | "";
  sensitivity_warning?: string;
  status: "new" | "accepted" | "monitoring" | "rejected" | "actioned";
  created_at: string;
  // Spec output schema fields
  data_anchor?: string;
  niche_pillar?: string;
  angle_type?: "direct-niche" | "moment-bridge";
  urgency_score?: number;
  compliance_flag?: boolean;
}

export interface AuditLogEntry {
  id: string;
  account_id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, any>;
  created_at: string;
}
