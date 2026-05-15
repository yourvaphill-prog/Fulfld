import React, { useState } from 'react';
import { AlertCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { T } from '../theme.js';

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
    padding: '5px 12px', borderRadius: T.radius.pill, border: `1px solid ${T.border.subtle}`,
    background: 'transparent', color: T.color.dim, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: T.font.mono,
  },
  card: {
    borderRadius: T.radius.md, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  cardHeader:  { display: 'flex', alignItems: 'center', gap: 8 },
  headline:    { fontWeight: 700, fontSize: 14, flex: 1, fontFamily: T.font.heading },
  entity:      { fontSize: 11, color: T.color.dim, marginTop: 2, fontFamily: T.font.mono },
  explanation: { fontSize: 13, color: T.color.muted, lineHeight: 1.5, fontFamily: T.font.mono },
  action:      { fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginTop: 2, fontFamily: T.font.mono },
  badge: {
    borderRadius: T.radius.sm, padding: '2px 7px', fontSize: 10,
    fontWeight: 700, textTransform: 'uppercase', fontFamily: T.font.mono,
  },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4, flexWrap: 'wrap', gap: 8,
  },
  trackBtn: {
    padding: '5px 13px', borderRadius: T.radius.sm,
    border: 'rgba(6,182,212,0.35) 1px solid',
    background: 'rgba(6,182,212,0.08)', color: T.color.cyan, cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: T.transition.fast,
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
    fontFamily: T.font.heading,
  },
  trackedBadge: {
    padding: '5px 13px', borderRadius: T.radius.sm, border: `1px solid ${T.color.green}44`,
    background: `${T.color.green}11`, color: T.color.green,
    fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
    fontFamily: T.font.heading,
  },
  empty: { textAlign: 'center', padding: '40px 0', color: T.color.dim, fontSize: 13, fontFamily: T.font.mono },
  count: { color: T.color.dim, fontSize: 12, fontFamily: T.font.mono },
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
                    e.currentTarget.style.background  = 'rgba(6,182,212,0.18)';
                    e.currentTarget.style.borderColor = 'rgba(6,182,212,0.60)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background  = 'rgba(6,182,212,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(6,182,212,0.35)';
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
