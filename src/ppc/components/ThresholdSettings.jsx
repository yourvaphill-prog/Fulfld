import React from 'react';
import { T } from '../theme.js';

const FIELDS = [
  {
    key: 'targetACoS',
    label: 'Target ACoS',
    description: 'Your goal advertising cost of sales. Campaigns below this are healthy.',
    type: 'percent',
    min: 1, max: 100,
  },
  {
    key: 'maxNoOrderSpend',
    label: 'Max Spend (No Orders)',
    description: 'Flag campaigns/terms that have spent this much with zero orders.',
    type: 'dollar',
    min: 0.5, max: 100,
  },
  {
    key: 'minClicks',
    label: 'Min Clicks to Judge',
    description: 'Minimum clicks before evaluating conversion rate.',
    type: 'number',
    min: 1, max: 500,
  },
  {
    key: 'minImpressions',
    label: 'Min Impressions for CTR',
    description: 'Minimum impressions before flagging low CTR.',
    type: 'number',
    min: 100, max: 100000,
  },
  {
    key: 'lowCTRThreshold',
    label: 'Low CTR Threshold',
    description: 'CTR below this is flagged as low. Typical Amazon CTR is 0.3–0.5%.',
    type: 'percent',
    min: 0.01, max: 5,
  },
  {
    key: 'highCPCThreshold',
    label: 'High CPC Threshold',
    description: 'CPC above this triggers a "high CPC" alert.',
    type: 'dollar',
    min: 0.1, max: 20,
  },
  {
    key: 'goodROASThreshold',
    label: 'Good ROAS Threshold',
    description: 'ROAS above this is considered profitable and scalable.',
    type: 'multiplier',
    min: 0.5, max: 20,
  },
  {
    key: 'minOrders',
    label: 'Min Orders to Scale',
    description: 'Minimum orders before recommending a budget increase.',
    type: 'number',
    min: 1, max: 100,
  },
];

const DEFAULT_THRESHOLDS = {
  targetACoS: 0.25,
  maxNoOrderSpend: 5,
  minClicks: 10,
  minImpressions: 1000,
  lowCTRThreshold: 0.003,
  highCPCThreshold: 2.0,
  goodROASThreshold: 3.0,
  minOrders: 1,
};

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 },
  card: { ...T.glass.card, borderRadius: T.radius.md, padding: '16px 20px' },
  row: { display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${T.border.subtle}` },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: 600, fontSize: 13, color: T.color.white, fontFamily: T.font.heading },
  desc: { fontSize: 12, color: T.color.dim, marginTop: 2, fontFamily: T.font.mono },
  input: {
    background: T.bg.input, border: `1px solid ${T.border.input}`, borderRadius: T.radius.sm,
    color: T.color.muted, padding: '6px 10px', fontSize: 13, width: 120, outline: 'none',
    textAlign: 'right', fontFamily: T.font.mono, colorScheme: 'dark',
  },
  display: { fontSize: 12, color: T.color.cyan, fontWeight: 600, minWidth: 60, textAlign: 'right', fontFamily: T.font.mono },
  resetBtn: {
    background: 'none', border: `1px solid ${T.border.base}`, borderRadius: T.radius.sm,
    color: T.color.dim, padding: '7px 16px', cursor: 'pointer', fontSize: 12,
    fontFamily: T.font.mono, transition: T.transition.fast,
  },
  heading: { color: T.color.white, fontWeight: 700, fontSize: 14, marginBottom: 16, fontFamily: T.font.heading },
};

function toDisplay(val, type) {
  if (type === 'percent') return (val * 100).toFixed(1) + '%';
  if (type === 'dollar') return '$' + val.toFixed(2);
  if (type === 'multiplier') return val.toFixed(1) + 'x';
  return String(val);
}

function fromInput(raw, type) {
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  if (type === 'percent') return n / 100;
  return n;
}

export { DEFAULT_THRESHOLDS };

export default function ThresholdSettings({ thresholds, onThresholdsChange }) {
  function handleChange(key, raw, type) {
    const val = fromInput(raw, type);
    if (val == null) return;
    onThresholdsChange(prev => ({ ...prev, [key]: val }));
  }

  function reset() {
    onThresholdsChange(DEFAULT_THRESHOLDS);
  }

  return (
    <div style={s.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: T.color.white, fontWeight: 700, fontSize: 15, fontFamily: T.font.heading }}>PPC Thresholds</div>
          <div style={{ color: T.color.dim, fontSize: 12, marginTop: 2, fontFamily: T.font.mono }}>
            These settings control how campaigns are scored and what triggers recommendations.
          </div>
        </div>
        <button style={s.resetBtn} onClick={reset}>Reset to Defaults</button>
      </div>

      <div style={s.card}>
        {FIELDS.map((field, i) => {
          const val = thresholds[field.key];
          const displayVal = toDisplay(val, field.type);
          const inputVal = field.type === 'percent' ? (val * 100).toFixed(1)
            : field.type === 'dollar' ? val.toFixed(2)
            : field.type === 'multiplier' ? val.toFixed(1)
            : String(val);

          return (
            <div key={field.key} style={{ ...s.row, ...(i === FIELDS.length - 1 ? { borderBottom: 'none', paddingBottom: 0, marginBottom: 0 } : {}) }}>
              <div style={s.labelRow}>
                <div>
                  <div style={s.label}>{field.label}</div>
                  <div style={s.desc}>{field.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={s.display}>{displayVal}</div>
                  <input
                    style={s.input}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.type === 'percent' ? 0.1 : field.type === 'dollar' ? 0.5 : 1}
                    defaultValue={inputVal}
                    onBlur={e => handleChange(field.key, e.target.value, field.type)}
                    onKeyDown={e => { if (e.key === 'Enter') handleChange(field.key, e.target.value, field.type); }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
