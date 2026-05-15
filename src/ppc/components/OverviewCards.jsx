import React from 'react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { T } from '../theme.js';

// ACoS and ROAS use dynamic health colors; all other cards use unified cyan
const CARDS = [
  { label: 'Total Spend',       key: 'totalSpend',       fmt: fmtCurrency },
  { label: 'Total Sales',       key: 'totalSales',       fmt: fmtCurrency },
  { label: 'Total Orders',      key: 'totalOrders',      fmt: v => fmtNum(v, 0) },
  { label: 'Avg ACoS',         key: 'avgAcos',          fmt: v => v === 'NO_SALES' ? 'No Sales' : fmtPct(v), acosField: true },
  { label: 'Avg ROAS',         key: 'avgRoas',          fmt: fmtRoas, roasField: true },
  { label: 'Total Clicks',      key: 'totalClicks',      fmt: v => fmtNum(v, 0) },
  { label: 'Total Impressions', key: 'totalImpressions', fmt: v => fmtNum(v, 0) },
  { label: 'Avg CTR',          key: 'avgCtr',           fmt: fmtPct },
  { label: 'Avg CPC',          key: 'avgCpc',           fmt: fmtCurrency },
  { label: 'Conv. Rate',        key: 'avgCvr',           fmt: fmtPct },
];

function acosColor(val, targetACoS) {
  if (val == null || val === 'NO_SALES') return '#ef4444';
  if (val <= targetACoS) return '#22c55e';
  if (val <= targetACoS * 1.5) return '#eab308';
  return '#ef4444';
}

function roasColor(val, goodROAS) {
  if (val == null) return '#888';
  if (val >= goodROAS) return '#22c55e';
  if (val >= 1) return '#eab308';
  return '#ef4444';
}

const s = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    ...T.glass.card,
    borderRadius: T.radius.md,
    padding: '14px 16px',
  },
  label: { color: T.color.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: T.font.mono },
  value: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: T.font.heading },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0',
    color: T.color.dim,
    fontSize: 14,
    fontFamily: T.font.mono,
  },
};

export default function OverviewCards({ summary, thresholds }) {
  if (!summary) {
    return (
      <div style={s.grid}>
        <div style={s.empty}>Upload Amazon Ads CSV reports to see your performance overview.</div>
      </div>
    );
  }

  return (
    <div style={s.grid}>
      {CARDS.map(card => {
        let color = T.color.cyan;
        if (card.acosField) color = acosColor(summary.avgAcos, thresholds.targetACoS);
        if (card.roasField) color = roasColor(summary.avgRoas, thresholds.goodROASThreshold);

        return (
          <div key={card.key} style={{ ...s.card, borderTop: `2px solid ${color}` }}>
            <div style={s.label}>{card.label}</div>
            <div style={{ ...s.value, color }}>{card.fmt(summary[card.key])}</div>
          </div>
        );
      })}
    </div>
  );
}
