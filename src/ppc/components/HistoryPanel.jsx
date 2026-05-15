import React from 'react';
import { Trash2, FileText, Clock } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtRoas } from '../utils/metricCalculator.js';
import { T } from '../theme.js';

// ── Metric definitions ─────────────────────────────────────────────────────────
const METRICS = [
  { key: 'totalSpend',   label: 'Spend',    fmt: v => fmtCurrency(v),                           neutral: true },
  { key: 'totalSales',   label: 'Sales',    fmt: v => fmtCurrency(v),                           higherIsBetter: true },
  { key: 'totalOrders',  label: 'Orders',   fmt: v => (v == null ? 'N/A' : v.toLocaleString()), higherIsBetter: true },
  { key: 'avgAcos',      label: 'Avg ACoS', fmt: v => fmtPct(v),                                higherIsBetter: false },
  { key: 'avgRoas',      label: 'Avg ROAS', fmt: v => fmtRoas(v),                               higherIsBetter: true },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatSavedAt(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

function Delta({ current, previous, higherIsBetter, neutral }) {
  if (
    current === 'NO_SALES' || previous === 'NO_SALES' ||
    current == null || previous == null ||
    typeof current !== 'number' || typeof previous !== 'number'
  ) return null;

  const delta = current - previous;
  if (Math.abs(delta) < 0.0001) return null;

  let color = '#555';
  if (!neutral) {
    const isGood = higherIsBetter ? delta > 0 : delta < 0;
    color = isGood ? '#22c55e' : '#ef4444';
  }

  const arrow  = delta > 0 ? '▲' : '▼';
  const absVal = Math.abs(delta);
  const disp   = absVal >= 10000
    ? `${(absVal / 1000).toFixed(1)}k`
    : absVal >= 1
    ? absVal.toFixed(1)
    : absVal.toFixed(3);

  return (
    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 3, color }}>
      {arrow} {disp}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '80px 24px', gap: 14, textAlign: 'center',
  },
  hint: {
    color: T.color.dim, fontSize: 12, maxWidth: 400, lineHeight: 1.7, fontFamily: T.font.mono,
  },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  caption: { color: T.color.dim, fontSize: 11, marginBottom: 4, fontFamily: T.font.mono },
  card: {
    ...T.glass.card,
    borderRadius: T.radius.lg,
    padding: '20px 24px',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16, gap: 12,
  },
  weekLabel: { color: T.color.white, fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: T.font.heading },
  savedAt: {
    color: T.color.dim, fontSize: 11,
    display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font.mono,
  },
  metrics: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10, marginBottom: 12,
  },
  metricBox: { background: T.bg.panel, borderRadius: T.radius.sm, padding: '10px 12px', border: `1px solid ${T.border.subtle}` },
  metricLabel: {
    color: T.color.dim, fontSize: 10, letterSpacing: '0.06em',
    textTransform: 'uppercase', marginBottom: 4, fontFamily: T.font.mono,
  },
  metricValue: { color: T.color.muted, fontSize: 14, fontWeight: 700, fontFamily: T.font.heading },
  files: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  fileTag: {
    background: T.bg.card, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.sm,
    padding: '3px 8px', fontSize: 10, color: T.color.dim,
    display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font.mono,
  },
  deleteBtn: {
    background: 'transparent', border: `1px solid ${T.border.subtle}`,
    borderRadius: T.radius.sm, padding: '7px 10px', color: T.color.dim,
    cursor: 'pointer', fontSize: 11,
    display: 'flex', alignItems: 'center', gap: 5,
    flexShrink: 0, transition: T.transition.fast,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function HistoryPanel({ history, onDelete }) {
  if (!history || history.length === 0) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 36 }}>📅</div>
        <div style={{ color: T.color.muted, fontSize: 14, fontWeight: 600, fontFamily: T.font.heading }}>No saved weeks yet</div>
        <div style={s.hint}>
          Upload your Amazon Ads reports, then click{' '}
          <span style={{ color: T.color.cyan }}>Save This Week</span>{' '}
          in the Weekly Report tab to capture a snapshot. Saved weeks show
          ACoS and ROAS deltas week-over-week so you can track progress.
        </div>
      </div>
    );
  }

  return (
    <div style={s.grid}>
      <div style={s.caption}>
        {history.length} saved week{history.length !== 1 ? 's' : ''} &middot; Newest first &middot; Max 12 rolling weeks
      </div>

      {history.map((entry, idx) => {
        const prev = history[idx + 1] || null;

        return (
          <div key={entry.id} style={s.card}>
            {/* Header */}
            <div style={s.cardHeader}>
              <div>
                <div style={s.weekLabel}>{entry.weekLabel}</div>
                <div style={s.savedAt}>
                  <Clock size={10} />
                  Saved {formatSavedAt(entry.savedAt)}
                </div>
              </div>
              <button
                style={s.deleteBtn}
                onClick={() => onDelete(entry.id)}
                title="Delete this snapshot"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = T.color.red;
                  e.currentTarget.style.color = T.color.red;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = T.border.subtle;
                  e.currentTarget.style.color = T.color.dim;
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>

            {/* Metric cards with week-over-week deltas */}
            <div style={s.metrics}>
              {METRICS.map(m => (
                <div key={m.key} style={s.metricBox}>
                  <div style={s.metricLabel}>{m.label}</div>
                  <div style={s.metricValue}>
                    {entry.summary ? m.fmt(entry.summary[m.key]) : '—'}
                  </div>
                  {prev && entry.summary && prev.summary && (
                    <Delta
                      current={entry.summary[m.key]}
                      previous={prev.summary[m.key]}
                      higherIsBetter={m.higherIsBetter}
                      neutral={!!m.neutral}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Source files */}
            {entry.uploadNames && entry.uploadNames.length > 0 && (
              <div style={s.files}>
                {entry.uploadNames.map((name, i) => (
                  <div key={i} style={s.fileTag}>
                    <FileText size={9} /> {name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
