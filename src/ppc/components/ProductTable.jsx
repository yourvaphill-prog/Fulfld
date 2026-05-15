import React, { useMemo, useState } from 'react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas, groupBy } from '../utils/metricCalculator.js';
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

function productStatus(row, thresholds) {
  if ((row.totalSpend ?? 0) >= thresholds.maxNoOrderSpend && (row.totalOrders ?? 0) === 0) {
    return { label: 'Wasted Spend', color: '#ef4444' };
  }
  if (typeof row.avgAcos === 'number' && row.avgAcos <= thresholds.targetACoS && (row.totalOrders ?? 0) > 0) {
    return { label: 'Profitable', color: '#22c55e' };
  }
  if ((row.totalClicks ?? 0) >= thresholds.minClicks && (row.totalOrders ?? 0) === 0) {
    return { label: 'Check Listing', color: '#eab308' };
  }
  if (typeof row.avgAcos === 'number' && row.avgAcos > thresholds.targetACoS * 1.5) {
    return { label: 'High ACoS', color: '#f97316' };
  }
  return { label: 'Monitoring', color: '#888' };
}

function productRecommendation(row, thresholds) {
  if ((row.totalSpend ?? 0) >= thresholds.maxNoOrderSpend && (row.totalOrders ?? 0) === 0) {
    return 'Pause ads — check listing quality, price, and reviews';
  }
  if ((row.totalClicks ?? 0) >= thresholds.minClicks && (row.totalOrders ?? 0) === 0) {
    return 'Clicks but no orders — review listing images, price, bullet points';
  }
  if (typeof row.avgAcos === 'number' && row.avgAcos <= thresholds.targetACoS && (row.totalOrders ?? 0) >= 1) {
    return 'Profitable — scale budget on this product';
  }
  if (typeof row.avgAcos === 'number' && row.avgAcos > thresholds.targetACoS * 1.5) {
    return 'High ACoS — lower bids or review search terms';
  }
  return 'Continue monitoring';
}

export default function ProductTable({ products, thresholds }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('totalSpend');
  const [sortDir, setSortDir] = useState('desc');

  const grouped = useMemo(() => {
    const byAsin = groupBy(products, 'asin');
    const bySku = groupBy(products.filter(p => !p.asin), 'sku');
    return [...byAsin, ...bySku];
  }, [products]);

  const rows = useMemo(() => {
    return grouped
      .filter(r => {
        const id = r.asin ?? r.sku ?? '';
        return !query || id.toLowerCase().includes(query.toLowerCase());
      })
      .sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (av == null) av = -Infinity;
        if (bv == null) bv = -Infinity;
        return sortDir === 'asc' ? av - bv : bv - av;
      });
  }, [grouped, query, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  if (!products.length) {
    return <div style={s.empty}>No product data. Upload an Advertised Product Report CSV to get started.</div>;
  }

  const cols = [
    { key: 'asin', label: 'ASIN / SKU' },
    { key: 'totalSpend', label: 'Spend' },
    { key: 'totalSales', label: 'Sales' },
    { key: 'totalOrders', label: 'Orders' },
    { key: 'totalClicks', label: 'Clicks' },
    { key: 'totalImpressions', label: 'Impr.' },
    { key: 'avgAcos', label: 'ACoS' },
    { key: 'avgRoas', label: 'ROAS' },
    { key: 'avgCvr', label: 'CVR' },
    { key: '_status', label: 'Status' },
    { key: '_rec', label: 'Recommendation' },
  ];

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <input
          style={s.searchInput}
          placeholder="Filter by ASIN or SKU..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span style={{ color: T.color.dim, fontSize: 12, fontFamily: T.font.mono }}>{rows.length} products</span>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col.key} style={s.th} onClick={() => toggleSort(col.key)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {sortKey === col.key ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const status = productStatus(row, thresholds);
              const rec = productRecommendation(row, thresholds);
              const id = row.asin ?? row.sku ?? '—';
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...s.td, color: T.color.white, fontFamily: T.font.mono, fontSize: 12 }}>{id}</td>
                  <td style={s.td}>{fmtCurrency(row.totalSpend)}</td>
                  <td style={s.td}>{fmtCurrency(row.totalSales)}</td>
                  <td style={s.td}>{fmtNum(row.totalOrders, 0)}</td>
                  <td style={s.td}>{fmtNum(row.totalClicks, 0)}</td>
                  <td style={s.td}>{fmtNum(row.totalImpressions, 0)}</td>
                  <td style={s.td}>
                    {row.avgAcos === 'NO_SALES'
                      ? <span style={{ color: T.color.red, fontSize: 11 }}>No Sales</span>
                      : <span style={{ color: typeof row.avgAcos === 'number' && row.avgAcos <= thresholds.targetACoS ? T.color.green : T.color.red }}>
                          {fmtPct(row.avgAcos)}
                        </span>
                    }
                  </td>
                  <td style={s.td}>{fmtRoas(row.avgRoas)}</td>
                  <td style={s.td}>{fmtPct(row.avgCvr)}</td>
                  <td style={s.td}>
                    <span style={{
                      background: status.color + '22', color: status.color,
                      border: `1px solid ${status.color}55`,
                      borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600,
                    }}>{status.label}</span>
                  </td>
                  <td style={{ ...s.td, color: T.color.dim, fontSize: 12, maxWidth: 260, whiteSpace: 'normal' }}>{rec}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
