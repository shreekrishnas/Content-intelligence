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
  sourceSummary: any;
  topics: any[];
  insights: any[];
  personaMatches: any[];
  depthAnalysis: any[];
  opportunities: any[];
  knowledgeContext: any;
  sourceReferences: any[];
  qualityCheck: any;
  analysisWarnings: string[];
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
