import React, { useMemo, useState } from 'react';
import { fmtCurrency, fmtPct, fmtNum } from '../utils/metricCalculator.js';

const TABS = [
  { key: 'winners', label: 'Winners', color: '#22c55e' },
  { key: 'wasted', label: 'Wasted Spend', color: '#ef4444' },
  { key: 'lowctr', label: 'Low CTR', color: '#eab308' },
  { key: 'highcpc', label: 'High CPC / Low CVR', color: '#f97316' },
];

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 },
  tabBar: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tab: {
    padding: '6px 14px', borderRadius: 6, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#888', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center' },
  searchInput: {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#ccc', padding: '6px 12px', fontSize: 13, flex: 1, outline: 'none',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: '#0a0a0a', color: '#888', fontWeight: 600,
    padding: '8px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap',
  },
  td: { padding: '9px 12px', borderBottom: '1px solid #141414', color: '#ccc', whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13 },
  actionBadge: { borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 },
};

function categorize(rows, thresholds) {
  const t = thresholds;
  const winners = [], wasted = [], lowctr = [], highcpc = [];

  for (const row of rows) {
    const isWinner = (row.orders ?? 0) > 0 && typeof row.acos === 'number' && row.acos <= t.targetACoS;
    const isWasted = (row.spend ?? 0) >= t.maxNoOrderSpend && (row.orders ?? 0) === 0;
    const isLowCtr = (row.impressions ?? 0) >= t.minImpressions && (row.ctr ?? 0) < t.lowCTRThreshold;
    const isHighCpc = (row.cpc ?? 0) >= t.highCPCThreshold && ((row.cvr ?? 0) < 0.05 || (row.orders ?? 0) === 0);

    if (isWinner) winners.push(row);
    else if (isWasted) wasted.push(row);
    else if (isLowCtr) lowctr.push(row);
    else if (isHighCpc) highcpc.push(row);
  }
  return { winners, wasted, lowctr, highcpc };
}

function TermRow({ row, action, actionColor, i, thresholds }) {
  return (
    <tr style={{ background: i % 2 === 0 ? 'transparent' : '#090909' }}>
      <td style={{ ...s.td, color: '#e2e8f0', maxWidth: 240, whiteSpace: 'normal' }}>
        {row.searchTerm ?? row.targeting ?? '—'}
      </td>
      <td style={{ ...s.td, color: '#aaa', fontSize: 12 }}>{row.campaignName ?? '—'}</td>
      <td style={s.td}>{row.matchType ?? '—'}</td>
      <td style={s.td}>{fmtNum(row.impressions, 0)}</td>
      <td style={s.td}>{fmtNum(row.clicks, 0)}</td>
      <td style={s.td}>{fmtPct(row.ctr)}</td>
      <td style={s.td}>{fmtCurrency(row.cpc)}</td>
      <td style={s.td}>{fmtCurrency(row.spend)}</td>
      <td style={s.td}>{fmtCurrency(row.sales)}</td>
      <td style={s.td}>{fmtNum(row.orders, 0)}</td>
      <td style={s.td}>
        {row.acos === 'NO_SALES'
          ? <span style={{ color: '#ef4444', fontSize: 11 }}>No Sales</span>
          : <span style={{ color: typeof row.acos === 'number' && row.acos <= thresholds.targetACoS ? '#22c55e' : '#f97316' }}>
              {fmtPct(row.acos)}
            </span>
        }
      </td>
      <td style={s.td}>
        <span style={{ ...s.actionBadge, background: actionColor + '22', color: actionColor, border: `1px solid ${actionColor}55` }}>
          {action}
        </span>
      </td>
    </tr>
  );
}

const COLS = ['Search Term', 'Campaign', 'Match Type', 'Impr.', 'Clicks', 'CTR', 'CPC', 'Spend', 'Sales', 'Orders', 'ACoS', 'Suggested Action'];

export default function SearchTermTable({ searchTerms, thresholds }) {
  const [activeTab, setActiveTab] = useState('winners');
  const [query, setQuery] = useState('');

  const cats = useMemo(() => categorize(searchTerms, thresholds), [searchTerms, thresholds]);

  const ACTION_MAP = {
    winners: { action: 'Move to Exact Match', color: '#22c55e' },
    wasted: { action: 'Add as Negative Keyword', color: '#ef4444' },
    lowctr: { action: 'Review Ad / Listing', color: '#eab308' },
    highcpc: { action: 'Lower Bid', color: '#f97316' },
  };

  const EMPTY_MAP = {
    winners: 'No winning search terms found. Upload a Search Term Report and ensure targetACoS threshold is set correctly.',
    wasted: 'No wasted search terms detected — great job! Adjust the "Max Spend (No Orders)" threshold if needed.',
    lowctr: 'No low-CTR search terms above your impressions threshold.',
    highcpc: 'No high-CPC / low-conversion search terms found.',
  };

  const rows = useMemo(() => {
    const base = cats[activeTab] ?? [];
    return base.filter(r => {
      const term = (r.searchTerm ?? r.targeting ?? '').toLowerCase();
      return !query || term.includes(query.toLowerCase());
    });
  }, [cats, activeTab, query]);

  const { action, color } = ACTION_MAP[activeTab];

  if (!searchTerms.length) {
    return <div style={s.empty}>No search term data. Upload a Search Term Report CSV to get started.</div>;
  }

  return (
    <div style={s.container}>
      <div style={s.tabBar}>
        {TABS.map(tab => {
          const count = (cats[tab.key] ?? []).length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              style={{
                ...s.tab,
                background: active ? tab.color + '22' : 'transparent',
                color: active ? tab.color : '#888',
                borderColor: active ? tab.color + '55' : '#2a2a2a',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      <div style={s.toolbar}>
        <input
          style={s.searchInput}
          placeholder="Filter search terms..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span style={{ color: '#555', fontSize: 12 }}>{rows.length} terms</span>
      </div>

      {rows.length === 0 ? (
        <div style={s.empty}>{EMPTY_MAP[activeTab]}</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>{COLS.map(c => <th key={c} style={s.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <TermRow key={i} row={row} action={action} actionColor={color} i={i} thresholds={thresholds} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
