import React, { useState } from 'react';
import { AlertCircle, TrendingUp, AlertTriangle } from 'lucide-react';

const SEVERITY_STYLE = {
  HIGH:        { color: '#ef4444', bg: '#ef444411', border: '#ef444433', icon: AlertCircle,   label: 'High Priority' },
  OPPORTUNITY: { color: '#22c55e', bg: '#22c55e11', border: '#22c55e33', icon: TrendingUp,    label: 'Opportunity'   },
  MEDIUM:      { color: '#f97316', bg: '#f9731611', border: '#f9731633', icon: AlertTriangle, label: 'Medium'        },
};

const TYPE_LABEL = { campaign: 'Campaign', searchTerm: 'Search Term', product: 'Product' };

function makeFingerprint(rec) {
  return `${rec.type}::${rec.entity}::${rec.headline}`;
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 10 },
  filters:   { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterBtn: {
    padding: '5px 12px', borderRadius: 20, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#888', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
  },
  card: {
    borderRadius: 8, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  cardHeader:  { display: 'flex', alignItems: 'center', gap: 8 },
  headline:    { fontWeight: 700, fontSize: 14, flex: 1 },
  entity:      { fontSize: 11, color: '#888', marginTop: 2 },
  explanation: { fontSize: 13, color: '#aaa', lineHeight: 1.5 },
  action:      { fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginTop: 2 },
  badge: {
    borderRadius: 4, padding: '2px 7px', fontSize: 10,
    fontWeight: 700, textTransform: 'uppercase',
  },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4, flexWrap: 'wrap', gap: 8,
  },
  trackBtn: {
    padding: '5px 13px', borderRadius: 6, border: '1px solid #3b82f655',
    background: '#3b82f611', color: '#60a5fa', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
  },
  trackedBadge: {
    padding: '5px 13px', borderRadius: 6, border: '1px solid #22c55e44',
    background: '#22c55e11', color: '#22c55e',
    fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
  },
  empty: { textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13 },
  count: { color: '#555', fontSize: 12 },
};

export default function RecommendationList({ recommendations, trackedFingerprints = new Set(), onTrackAction }) {
  const [filter, setFilter] = useState('ALL');

  const filtered = filter === 'ALL'
    ? recommendations
    : recommendations.filter(r => r.severity === filter);

  const counts = {
    HIGH:        recommendations.filter(r => r.severity === 'HIGH').length,
    OPPORTUNITY: recommendations.filter(r => r.severity === 'OPPORTUNITY').length,
    MEDIUM:      recommendations.filter(r => r.severity === 'MEDIUM').length,
  };

  if (!recommendations.length) {
    return <div style={s.empty}>Upload CSV reports to generate smart recommendations.</div>;
  }

  return (
    <div style={s.container}>
      {/* Severity filters */}
      <div style={s.filters}>
        {['ALL', 'HIGH', 'OPPORTUNITY', 'MEDIUM'].map(f => {
          const active = filter === f;
          const st     = SEVERITY_STYLE[f];
          const color  = st?.color ?? '#888';
          const count  = f === 'ALL' ? recommendations.length : counts[f];
          return (
            <button
              key={f}
              style={{
                ...s.filterBtn,
                background:  active ? (color + '22') : 'transparent',
                color:       active ? color : '#888',
                borderColor: active ? (color + '55') : '#2a2a2a',
              }}
              onClick={() => setFilter(f)}
            >
              {f === 'ALL' ? 'All' : SEVERITY_STYLE[f].label} ({count})
            </button>
          );
        })}
      </div>

      <div style={s.count}>{filtered.length} recommendation{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.map((rec, i) => {
        const st       = SEVERITY_STYLE[rec.severity] ?? SEVERITY_STYLE.MEDIUM;
        const Icon     = st.icon;
        const fp       = makeFingerprint(rec);
        const isTracked = trackedFingerprints.has(fp);

        return (
          <div key={i} style={{ ...s.card, background: st.bg, border: `1px solid ${st.border}` }}>
            {/* Header row */}
            <div style={s.cardHeader}>
              <Icon size={16} color={st.color} />
              <div style={{ ...s.headline, color: st.color }}>{rec.headline}</div>
              <span style={{
                ...s.badge,
                background: st.bg, color: st.color, border: `1px solid ${st.border}`,
              }}>
                {TYPE_LABEL[rec.type] ?? rec.type}
              </span>
            </div>

            {/* Body */}
            <div style={s.explanation}>{rec.explanation}</div>
            <div style={{ ...s.action, color: st.color }}>→ {rec.action}</div>

            {/* Footer: entity + track button */}
            <div style={s.cardFooter}>
              <div style={s.entity}>{rec.entity}</div>

              {isTracked ? (
                <div style={s.trackedBadge}>
                  ✓ Tracked
                </div>
              ) : (
                <button
                  style={s.trackBtn}
                  onClick={() => onTrackAction?.(rec)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background   = '#3b82f622';
                    e.currentTarget.style.borderColor  = '#3b82f688';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background   = '#3b82f611';
                    e.currentTarget.style.borderColor  = '#3b82f655';
                  }}
                  title="Add to Action Tracker"
                >
                  Track →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
