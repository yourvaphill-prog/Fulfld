import React from 'react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';

const CARDS = [
  { label: 'Total Spend', key: 'totalSpend', fmt: fmtCurrency, color: '#3b82f6' },
  { label: 'Total Sales', key: 'totalSales', fmt: fmtCurrency, color: '#22c55e' },
  { label: 'Total Orders', key: 'totalOrders', fmt: v => fmtNum(v, 0), color: '#00c896' },
  { label: 'Avg ACoS', key: 'avgAcos', fmt: v => v === 'NO_SALES' ? 'No Sales' : fmtPct(v), color: '#eab308', acosField: true },
  { label: 'Avg ROAS', key: 'avgRoas', fmt: fmtRoas, color: '#22c55e' },
  { label: 'Total Clicks', key: 'totalClicks', fmt: v => fmtNum(v, 0), color: '#a78bfa' },
  { label: 'Total Impressions', key: 'totalImpressions', fmt: v => fmtNum(v, 0), color: '#60a5fa' },
  { label: 'Avg CTR', key: 'avgCtr', fmt: fmtPct, color: '#f59e0b' },
  { label: 'Avg CPC', key: 'avgCpc', fmt: fmtCurrency, color: '#f97316' },
  { label: 'Conv. Rate', key: 'avgCvr', fmt: fmtPct, color: '#34d399' },
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
    background: '#111',
    borderRadius: 8,
    padding: '14px 16px',
    border: '1px solid #1e1e1e',
  },
  label: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  value: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0',
    color: '#444',
    fontSize: 14,
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
        let color = card.color;
        if (card.key === 'avgAcos') color = acosColor(summary.avgAcos, thresholds.targetACoS);
        if (card.key === 'avgRoas') color = roasColor(summary.avgRoas, thresholds.goodROASThreshold);

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
