import { useState, useRef } from 'react';
import { useAppStore, type OpportunityItem } from '@/store';

const uid = (prefix: string) => prefix + '_' + Math.random().toString(36).slice(2, 9);

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

function generateOutline(opp: OpportunityItem): string {
  return [
    `HOOK: ${(opp.sourceInsight || '').slice(0, 90)}`,
    `WHY THIS MATTERS: Connects to ${opp.personaName || 'your audience'} — ${opp.personaPainPoint || 'a common challenge'}`,
    `MAIN POINT: ${opp.contentAngle}`,
    `SUPPORTING CONTEXT: ${(opp.sourceContext || '').slice(0, 160)}`,
    `CLOSE / SOFT CTA: ${opp.suggestedCTA || 'Learn more'}`,
  ].join('\n');
}

function generateDraft(opp: OpportunityItem): string {
  return [
    `${opp.title}: what it actually means for you`,
    '',
    opp.sourceInsight || '',
    '',
    opp.contentAngle || '',
    '',
    'In practice, this comes down to keeping the plan simple and revisiting it as circumstances change — not chasing every new idea that comes along.',
    '',
    opp.suggestedCTA || '',
  ].join('\n');
}

function defaultQuality() {
  return {
    Language: 'ok', Readability: 'ok', 'India Context': 'ok',
    'Brand Tone': 'ok', 'Persona Tone': 'ok', 'Sales Pressure': 'ok',
    'Jargon Level': 'warn', 'Source Support': 'ok',
  };
}

function defaultVisualRec(opp: OpportunityItem) {
  return {
    concept: `Visual metaphor connecting ${opp.contentAngle?.slice(0, 40) || 'key theme'} to everyday decision-making`,
    format: `${opp.recommendedFormat || 'Post'} optimized graphic, 1080x1080 or 1200x628`,
    data: 'Highlight 1 key statistic from the source context as a data callout',
  };
}

function defaultSourceRefs(opp: OpportunityItem) {
  return [
    { label: 'Source Insight', text: opp.sourceInsight || 'N/A' },
    { label: 'Source Context', text: opp.sourceContext || 'N/A' },
    { label: 'Expert Attribution', text: opp.expertAttribution || 'N/A' },
  ];
}

/* ------------------------------------------------------------------ */
/*  Quality Panel                                                      */
/* ------------------------------------------------------------------ */

function QualityPanel({ quality }: { quality: Record<string, string> }) {
  return (
    <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
      <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Quality Review</h4>
      <div className="grid grid-4">
        {Object.entries(quality).map(([k, v]) => {
          const color = v === 'ok' ? '#10B981' : '#F59E0B';
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{k}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function StudioPage() {
  const opportunities = useAppStore((s) => s.opportunities);
  const activeStudioOpp = useAppStore((s) => s.activeStudioOpp);
  const studioAsset = useAppStore((s) => s.studioAsset);
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);
  const setStudioAsset = useAppStore((s) => s.setStudioAsset);
  const addCalendarEntry = useAppStore((s) => s.addCalendarEntry);
  const kb = useAppStore((s) => s.kb);

  const [feedback, setFeedback] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const sentOpps = opportunities.filter((o) => o.status === 'sent');
  const activeOpp = activeStudioOpp ? opportunities.find((o) => o.id === activeStudioOpp) : null;

  /* ---- KB context helpers ---- */
  function kbByCategory(cat: string) {
    return kb.filter((f) => f.active && f.category === cat);
  }

  /* ---- State A: No active opportunity ---- */
  if (!activeOpp) {
    return (
      <div>
        <p className="eyebrow">Content Studio</p>
        <h1 className="page-title">Studio</h1>
        <p className="page-desc">Select an opportunity to begin content creation.</p>

        {sentOpps.length === 0 ? (
          <div className="empty-state">
            <p>No opportunities have been sent to Studio yet.</p>
            <p style={{ marginTop: 8, opacity: 0.7 }}>Send opportunities from the Opportunities page.</p>
          </div>
        ) : (
          <div className="grid grid-3">
            {sentOpps.map((opp) => (
              <div
                key={opp.id}
                className="glass-card-static"
                style={{ padding: 20, cursor: 'pointer' }}
                onClick={() => setActiveStudioOpp(opp.id)}
              >
                <span className="badge" style={{ background: '#10B98118', color: '#10B981', marginBottom: 8, display: 'inline-block' }}>
                  In Studio
                </span>
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{opp.title}</h3>
                <p style={{ fontSize: 13, opacity: 0.7 }}>{opp.contentAngle}</p>
                <p style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>{opp.recommendedFormat}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---- State B: Opportunity selected, no asset ---- */
  if (!studioAsset) {
    const brandFiles = kbByCategory('brand');
    const personaToneFiles = kbByCategory('personaTone');
    const expertFiles = kbByCategory('expert');
    const guidelineFiles = kbByCategory('guidelines');
    const terminologyFiles = kbByCategory('terminology');
    const complianceFiles = kbByCategory('compliance');

    function handleGenerate() {
      const outline = generateOutline(activeOpp!);
      setStudioAsset({
        stage: 'outline',
        outline,
        draft: '',
        feedbackLog: [],
        sourceRefs: defaultSourceRefs(activeOpp!),
        visualRec: defaultVisualRec(activeOpp!),
        calendared: false,
      });
      showToast('Outline generated');
    }

    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setActiveStudioOpp(null)} style={{ marginBottom: 12 }}>
          &larr; All opportunities
        </button>
        <h2 className="page-title" style={{ marginBottom: 16 }}>{activeOpp.title}</h2>

        <div className="glass-card-static" style={{ padding: 20, marginBottom: 20 }}>
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Content Context</h4>
          <div className="grid grid-2" style={{ gap: 12 }}>
            <ContextRow label="Persona" value={activeOpp.personaName || 'None matched'} />
            <ContextRow label="Pain Point" value={activeOpp.personaPainPoint || 'N/A'} />
            <ContextRow label="Content Angle" value={activeOpp.contentAngle} />
            <ContextRow label="Persona Tone" value={personaToneFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
            <ContextRow label="Brand Voice" value={brandFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
            <ContextRow label="Expert Voice" value={expertFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
            <ContextRow label="Platform Guideline" value={guidelineFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
            <ContextRow label="Format" value={activeOpp.recommendedFormat} />
            <ContextRow label="India Context" value={terminologyFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
            <ContextRow label="Compliance Rules" value={complianceFiles.map((f) => f.fileName).join(', ') || 'No file loaded'} />
          </div>
        </div>

        <button className="btn btn-brand" onClick={handleGenerate}>Generate Outline</button>
      </div>
    );
  }

  /* ---- State C: Asset in progress ---- */
  const asset = studioAsset!;
  const opp = activeOpp!;
  const { stage } = asset;

  function handleRegenerate() {
    if (!feedback.trim()) {
      showToast('Enter feedback before regenerating', 'warn');
      return;
    }
    const currentContent = contentRef.current?.innerText || (stage === 'outline' ? asset.outline : asset.draft);
    const revised = currentContent + `\n\n[Revised for feedback: ${feedback}]`;
    const newLog = [...asset.feedbackLog, { stage, feedback, at: Date.now() }];

    if (stage === 'outline') {
      setStudioAsset({ ...asset, outline: revised, feedbackLog: newLog });
    } else {
      setStudioAsset({ ...asset, draft: revised, feedbackLog: newLog });
    }
    setFeedback('');
    showToast('Content regenerated with feedback');
  }

  function handleApproveOutline() {
    const outlineText = contentRef.current?.innerText || asset.outline;
    const draft = generateDraft(opp);
    setStudioAsset({ ...asset, stage: 'draft', outline: outlineText, draft });
    showToast('Outline approved. Draft generated.');
  }

  function handleApproveDraft() {
    const draftText = contentRef.current?.innerText || asset.draft;
    setStudioAsset({ ...asset, stage: 'approved', draft: draftText, quality: defaultQuality() });
    showToast('Draft approved. Quality review complete.');
  }

  function handleSendToCalendar() {
    addCalendarEntry({
      id: uid('cal'),
      opportunityId: opp.id,
      title: opp.title,
      format: opp.recommendedFormat,
      draft: asset.draft,
      quality: asset.quality,
      approvedAt: Date.now(),
      scheduled: null,
    });
    setStudioAsset({ ...asset, calendared: true });
    showToast('Content added to calendar');
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => setActiveStudioOpp(null)} style={{ marginBottom: 12 }}>
        &larr; All opportunities
      </button>
      <h2 className="page-title" style={{ marginBottom: 4 }}>{opp.title}</h2>
      <p className="page-desc" style={{ marginBottom: 16 }}>
        Stage: <span className="badge" style={{ marginLeft: 4 }}>{stage}</span>
      </p>

      {stage === 'approved' ? (
        <>
          {/* Read-only draft */}
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Approved Draft</h4>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{asset.draft}</pre>
          </div>

          {/* Quality Panel */}
          {asset.quality && <QualityPanel quality={asset.quality} />}

          {/* Source References */}
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Source References</h4>
            {asset.sourceRefs.map((ref: { label: string; text: string }, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{ref.label}</p>
                <p style={{ fontSize: 13 }}>{ref.text}</p>
              </div>
            ))}
          </div>

          {/* Visual Rec */}
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Visual Creative Recommendation</h4>
            <ContextRow label="Concept" value={asset.visualRec.concept} />
            <ContextRow label="Format" value={asset.visualRec.format} />
            <ContextRow label="Data" value={asset.visualRec.data} />
          </div>

          {/* Send to Calendar */}
          {!asset.calendared ? (
            <button className="btn btn-brand" onClick={handleSendToCalendar}>Send to Calendar</button>
          ) : (
            <span className="badge" style={{ background: '#10B98118', color: '#10B981' }}>Added to Calendar</span>
          )}
        </>
      ) : (
        <>
          {/* Editable content */}
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 8 }}>
              {stage === 'outline' ? 'Outline' : 'Draft'}
            </h4>
            <div
              ref={contentRef}
              className="glass-textarea"
              contentEditable
              suppressContentEditableWarning
              style={{ minHeight: 180, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}
            >
              {stage === 'outline' ? asset.outline : asset.draft}
            </div>
          </div>

          {/* Feedback row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <textarea
              className="glass-textarea"
              placeholder="Enter feedback for regeneration..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              style={{ flex: 1, minWidth: 200, minHeight: 48 }}
            />
            <button className="btn btn-secondary btn-sm" onClick={handleRegenerate}>Regenerate</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={stage === 'outline' ? handleApproveOutline : handleApproveDraft}
            >
              {stage === 'outline' ? 'Approve outline' : 'Approve draft → quality review'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{label}: </span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}
