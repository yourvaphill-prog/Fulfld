import React, { useMemo, useState } from 'react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas, groupBy } from '../utils/metricCalculator.js';
import { calcHealthScore, healthLabel, suggestedAction } from '../utils/healthScore.js';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { T } from '../theme.js';

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center' },
  searchInput: {
    background: T.bg.input, border: `1px solid ${T.border.input}`, borderRadius: T.radius.sm,
    color: T.color.muted, padding: '6px 12px', fontSize: 13, flex: 1, outline: 'none',
    fontFamily: T.font.mono,
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: T.bg.panel, color: T.color.dim, fontWeight: 600,
    padding: '8px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: `1px solid ${T.border.base}`, whiteSpace: 'nowrap', cursor: 'pointer',
    userSelect: 'none', fontFamily: T.font.mono,
  },
  td: { padding: '9px 12px', borderBottom: `1px solid ${T.border.subtle}`, color: T.color.muted, whiteSpace: 'nowrap', fontFamily: T.font.mono },
  empty: { textAlign: 'center', padding: '40px 0', color: T.color.dim, fontFamily: T.font.mono },
};

function ActionBadge({ action, color }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {action}
    </span>
  );
}

function HealthBadge({ score }) {
  const { label, color } = healthLabel(score);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 28, height: 5, borderRadius: 3,
        background: `linear-gradient(to right, ${color} ${score}%, ${T.border.base} ${score}%)`,
      }} />
      <span style={{ color, fontWeight: 600, fontSize: 12 }}>{score}</span>
      <span style={{ color: T.color.dim, fontSize: 11 }}>{label}</span>
    </span>
  );
}

const COLS = [
  { key: 'campaignName', label: 'Campaign', width: 220, render: v => <span style={{ color: '#e2e8f0' }} title={v}>{v}</span> },
  { key: 'totalSpend', label: 'Spend', render: fmtCurrency },
  { key: 'totalSales', label: 'Sales', render: fmtCurrency },
  { key: 'totalOrders', label: 'Orders', render: v => fmtNum(v, 0) },
  { key: 'totalImpressions', label: 'Impr.', render: v => fmtNum(v, 0) },
  { key: 'totalClicks', label: 'Clicks', render: v => fmtNum(v, 0) },
  { key: 'avgCtr', label: 'CTR', render: fmtPct },
  { key: 'avgCpc', label: 'CPC', render: fmtCurrency },
  { key: 'avgAcos', label: 'ACoS', render: v => v === 'NO_SALES' ? <span style={{ color: '#ef4444', fontSize: 11 }}>No Sales</span> : fmtPct(v) },
  { key: 'avgRoas', label: 'ROAS', render: fmtRoas },
  { key: '_health', label: 'Health' },
  { key: '_action', label: 'Action' },
];

export default function CampaignTable({ campaigns, thresholds }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('totalSpend');
  const [sortDir, setSortDir] = useState('desc');

  const grouped = useMemo(() => groupBy(campaigns, 'campaignName'), [campaigns]);

  const rows = useMemo(() => {
    return grouped
      .filter(r => !query || (r.campaignName ?? '').toLowerCase().includes(query.toLowerCase()))
      .map(r => ({
        ...r,
        _healthScore: calcHealthScore(r, thresholds),
        _action: suggestedAction(r, thresholds),
      }))
      .sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === '_health') { av = a._healthScore; bv = b._healthScore; }
        if (av == null) av = -Infinity;
        if (bv == null) bv = -Infinity;
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === 'asc' ? av - bv : bv - av;
      });
  }, [grouped, query, sortKey, sortDir, thresholds]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  if (!campaigns.length) {
    return <div style={s.empty}>No campaign data. Upload a Campaign Report CSV to get started.</div>;
  }

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <input
          style={s.searchInput}
          placeholder="Filter campaigns..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span style={{ color: T.color.dim, fontSize: 12, fontFamily: T.font.mono }}>{rows.length} campaigns</span>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {COLS.map(col => (
                <th key={col.key} style={{ ...s.th, width: col.width }}
                  onClick={() => toggleSort(col.key)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {sortKey === col.key
                      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ ...s.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: '#e2e8f0' }} title={row.campaignName}>{row.campaignName}</span>
                </td>
                <td style={s.td}>{fmtCurrency(row.totalSpend)}</td>
                <td style={s.td}>{fmtCurrency(row.totalSales)}</td>
                <td style={s.td}>{fmtNum(row.totalOrders, 0)}</td>
                <td style={s.td}>{fmtNum(row.totalImpressions, 0)}</td>
                <td style={s.td}>{fmtNum(row.totalClicks, 0)}</td>
                <td style={s.td}>{fmtPct(row.avgCtr)}</td>
                <td style={s.td}>{fmtCurrency(row.avgCpc)}</td>
                <td style={s.td}>
                  {row.avgAcos === 'NO_SALES'
                    ? <span style={{ color: T.color.red, fontSize: 11, fontWeight: 600 }}>No Sales</span>
                    : <span style={{ color: typeof row.avgAcos === 'number' && row.avgAcos <= thresholds.targetACoS ? T.color.green : T.color.red }}>
                        {fmtPct(row.avgAcos)}
                      </span>
                  }
                </td>
                <td style={s.td}>
                  <span style={{ color: (row.avgRoas ?? 0) >= thresholds.goodROASThreshold ? T.color.green : T.color.muted }}>
                    {fmtRoas(row.avgRoas)}
                  </span>
                </td>
                <td style={s.td}><HealthBadge score={row._healthScore} /></td>
                <td style={s.td}><ActionBadge action={row._action.action} color={row._action.color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
