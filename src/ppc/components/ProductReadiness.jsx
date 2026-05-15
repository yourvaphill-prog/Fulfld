import React, { useMemo, useState } from 'react';
import { Download, Copy, CheckCircle } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { buildReadinessPlan, summariseReadiness, READINESS_META } from '../utils/adReadinessScore.js';

// ── Filter tab definitions ─────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'scale',      label: 'Ready to Scale' },
  { key: 'monitor',    label: 'Monitor' },
  { key: 'listing',    label: 'Needs Listing Review' },
  { key: 'offer',      label: 'Needs Offer/Price' },
  { key: 'poor_fit',   label: 'Poor PPC Fit' },
  { key: 'needs_data', label: 'Needs More Data' },
];

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  if (!rows.length) return;

  const headers = [
    'ASIN', 'SKU', 'Spend', 'Sales', 'Orders', 'Clicks', 'Impressions',
    'ACoS (%)', 'ROAS', 'CVR (%)', 'Readiness Score', 'Readiness Label',
    'Reason', 'Recommended Action',
  ];

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(r => {
    const acosPct = typeof r.avgAcos === 'number' ? (r.avgAcos * 100).toFixed(1) : '';
    const roasVal = typeof r.avgRoas === 'number'  ? r.avgRoas.toFixed(2)        : '';
    const cvrPct  = typeof r.avgCvr  === 'number'  ? (r.avgCvr  * 100).toFixed(1) : '';
    return [
      esc(r.asin             ?? ''),
      esc(r.sku              ?? ''),
      esc((r.totalSpend      ?? 0).toFixed(2)),
      esc((r.totalSales      ?? 0).toFixed(2)),
      esc(r.totalOrders      ?? 0),
      esc(r.totalClicks      ?? 0),
      esc(r.totalImpressions ?? 0),
      esc(acosPct),
      esc(roasVal),
      esc(cvrPct),
      esc(r.score            ?? ''),
      esc(r.label            ?? ''),
      esc(r.reason           ?? ''),
      esc(r.action           ?? ''),
    ].join(',');
  });

  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `product-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Copy summary ───────────────────────────────────────────────────────────────
function buildSummaryText(plan, stats) {
  const date    = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const divider = '─'.repeat(44);

  const parts = [
    stats.scaleCount     > 0 ? `${stats.scaleCount} Ready to Scale`          : '',
    stats.monitorCount   > 0 ? `${stats.monitorCount} Monitor`                : '',
    stats.listingCount   > 0 ? `${stats.listingCount} Needs Listing Review`   : '',
    stats.offerCount     > 0 ? `${stats.offerCount} Needs Offer/Price`        : '',
    stats.poorFitCount   > 0 ? `${stats.poorFitCount} Poor PPC Fit`           : '',
    stats.needsDataCount > 0 ? `${stats.needsDataCount} Needs More Data`      : '',
  ].filter(Boolean);

  const lines = [
    `PPC Product Ad Readiness Report — ${date}`,
    divider,
    `${stats.total} product${stats.total !== 1 ? 's' : ''} analyzed`,
    parts.join(' · '),
  ];

  if (stats.spendAtRisk > 0) {
    lines.push(`Estimated spend at risk: $${stats.spendAtRisk.toFixed(2)}`);
  }

  const groups = [
    { group: 'scale',      heading: 'READY TO SCALE' },
    { group: 'poor_fit',   heading: 'POOR PPC FIT' },
    { group: 'listing',    heading: 'NEEDS LISTING REVIEW' },
    { group: 'offer',      heading: 'NEEDS OFFER/PRICE REVIEW' },
    { group: 'monitor',    heading: 'MONITOR' },
    { group: 'needs_data', heading: 'NEEDS MORE DATA' },
  ];

  for (const g of groups) {
    const rows = plan.filter(r => r.statusGroup === g.group);
    if (!rows.length) continue;
    lines.push('', g.heading);
    for (const r of rows) {
      const id = r.asin ?? r.sku ?? '—';
      lines.push(`• ${id} — ${r.reason} → ${r.action}`);
    }
  }

  return lines.join('\n');
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  summaryBar: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  summaryCard: {
    background: '#0d0d0d', border: '1px solid #1e1e1e',
    borderRadius: 8, padding: '12px 18px', minWidth: 130,
  },
  summaryLabel: {
    color: '#555', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  summaryValue: { color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 2 },
  filterRow: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  filterBtn: {
    padding: '5px 12px', borderRadius: 6, border: '1px solid #1e1e1e',
    background: 'transparent', color: '#666', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  searchBox: {
    marginLeft: 'auto', background: '#0d0d0d', border: '1px solid #1e1e1e',
    borderRadius: 6, color: '#ccc', padding: '5px 10px', fontSize: 12,
    outline: 'none', width: 220,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', color: '#555', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 10px', borderBottom: '1px solid #1a1a1a', whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 10px', borderBottom: '1px solid #111',
    color: '#ccc', fontSize: 12, verticalAlign: 'top',
  },
  emptyState: { textAlign: 'center', padding: '60px 20px', color: '#555', fontSize: 13 },
};

function actionBtn(active, color = '#22c55e') {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border:      active ? `1px solid ${color}44` : '1px solid #1e1e1e',
    background:  active ? `${color}11`           : 'transparent',
    color:       active ? color                  : '#666',
  };
}

// ── Score bar (mirrors CampaignTable / ScalingPlan health bar style) ───────────
function ScoreBar({ score, color }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 36, height: 5, borderRadius: 3,
        background: `linear-gradient(to right, ${color} ${score}%, #2a2a2a ${score}%)`,
        flexShrink: 0,
      }} />
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{score}</span>
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ProductReadiness({ products, thresholds }) {
  const [filterGroup, setFilterGroup] = useState('all');
  const [query,       setQuery]       = useState('');
  const [copied,      setCopied]      = useState(false);

  const plan = useMemo(
    () => buildReadinessPlan(products, thresholds),
    [products, thresholds]
  );

  const stats = useMemo(() => summariseReadiness(plan), [plan]);

  const groupCounts = useMemo(() => {
    const counts = { scale: 0, monitor: 0, listing: 0, offer: 0, poor_fit: 0, needs_data: 0 };
    for (const r of plan) {
      if (counts[r.statusGroup] !== undefined) counts[r.statusGroup]++;
    }
    return counts;
  }, [plan]);

  const displayRows = useMemo(() => {
    const byGroup = filterGroup === 'all'
      ? plan
      : plan.filter(r => r.statusGroup === filterGroup);
    if (!query.trim()) return byGroup;
    const q = query.toLowerCase();
    return byGroup.filter(r =>
      (r.asin ?? '').toLowerCase().includes(q) ||
      (r.sku  ?? '').toLowerCase().includes(q)
    );
  }, [plan, filterGroup, query]);

  function handleCopy() {
    const text = buildSummaryText(plan, stats);
    const write = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(write).catch(() => fallbackCopy(text, write));
    } else {
      fallbackCopy(text, write);
    }
  }

  function fallbackCopy(text, cb) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    cb();
  }

  // ── Empty state ──
  if (!products.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
        <div style={{ color: '#888', fontWeight: 600, marginBottom: 6 }}>No product data uploaded</div>
        <div>Upload an Advertised Product Report CSV to generate readiness scores</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Summary bar ── */}
      <div style={s.summaryBar}>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Analyzed</div>
          <div style={s.summaryValue}>{stats.total}</div>
        </div>

        {stats.scaleCount > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#22c55e33' }}>
            <div style={s.summaryLabel}>Ready to Scale</div>
            <div style={{ ...s.summaryValue, color: '#22c55e' }}>{stats.scaleCount}</div>
          </div>
        )}

        {stats.needsReviewCount > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#f9731633' }}>
            <div style={s.summaryLabel}>Needs Review</div>
            <div style={{ ...s.summaryValue, color: '#f97316' }}>{stats.needsReviewCount}</div>
          </div>
        )}

        {stats.poorFitCount > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#ef444433' }}>
            <div style={s.summaryLabel}>Poor PPC Fit</div>
            <div style={{ ...s.summaryValue, color: '#ef4444' }}>{stats.poorFitCount}</div>
          </div>
        )}

        {stats.monitorCount > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#3b82f633' }}>
            <div style={s.summaryLabel}>Monitor</div>
            <div style={{ ...s.summaryValue, color: '#3b82f6' }}>{stats.monitorCount}</div>
          </div>
        )}

        {stats.spendAtRisk > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#ef444433' }}>
            <div style={s.summaryLabel}>Spend at Risk</div>
            <div style={{ ...s.summaryValue, color: '#ef4444', fontSize: 17 }}>
              {fmtCurrency(stats.spendAtRisk)}
            </div>
          </div>
        )}
      </div>

      {/* ── Filter + action row ── */}
      <div style={s.filterRow}>
        {FILTER_TABS.map(tab => {
          const isActive = filterGroup === tab.key;
          const meta     = tab.key !== 'all' ? READINESS_META[tab.key] : null;
          const tabColor = meta ? meta.color : '#3b82f6';
          const count    = tab.key === 'all' ? plan.length : (groupCounts[tab.key] ?? 0);

          return (
            <button
              key={tab.key}
              style={{
                ...s.filterBtn,
                color:       isActive ? tabColor : '#666',
                borderColor: isActive ? tabColor + '55' : '#1e1e1e',
                background:  isActive ? tabColor + '11' : 'transparent',
              }}
              onClick={() => setFilterGroup(tab.key)}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  marginLeft: 5,
                  background:  isActive ? tabColor : '#333',
                  color:       isActive ? '#fff' : '#999',
                  borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <input
          style={s.searchBox}
          type="text"
          placeholder="Search by ASIN or SKU…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {/* Copy Summary */}
        <button
          style={actionBtn(copied, '#22c55e')}
          onClick={handleCopy}
          title="Copy readiness summary to clipboard"
        >
          {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
          {copied ? 'Copied ✓' : 'Copy Summary'}
        </button>

        {/* Export CSV */}
        <button
          style={{
            ...actionBtn(false),
            color:      displayRows.length ? '#22c55e' : '#444',
            border:     displayRows.length ? '1px solid #22c55e44' : '1px solid #333',
            background: displayRows.length ? '#22c55e11' : 'transparent',
            cursor:     displayRows.length ? 'pointer' : 'not-allowed',
          }}
          disabled={!displayRows.length}
          onClick={() => exportCSV(displayRows)}
          title="Export filtered rows as CSV"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* ── Table ── */}
      {displayRows.length === 0 ? (
        <div style={{ ...s.emptyState, padding: '40px 20px' }}>
          <div style={{ color: '#888' }}>No products match this filter</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, minWidth: 140 }}>ASIN / SKU</th>
                <th style={s.th}>Score</th>
                <th style={s.th}>Readiness</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Spend</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Sales</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Clicks</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ACoS</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ROAS</th>
                <th style={{ ...s.th, textAlign: 'right' }}>CVR</th>
                <th style={{ ...s.th, minWidth: 200 }}>Reason</th>
                <th style={{ ...s.th, minWidth: 200 }}>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const id = row.asin ?? row.sku ?? '—';
                return (
                  <tr
                    key={id + i}
                    style={{ background: i % 2 === 0 ? 'transparent' : '#090909' }}
                  >
                    {/* ASIN / SKU */}
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0' }}>
                      {row.asin && <div style={{ fontWeight: 600 }}>{row.asin}</div>}
                      {row.sku  && <div style={{ color: '#666', fontSize: 10 }}>{row.sku}</div>}
                    </td>

                    {/* Score bar */}
                    <td style={s.td}>
                      <ScoreBar score={row.score} color={row.color} />
                    </td>

                    {/* Readiness badge */}
                    <td style={s.td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        color: row.color, background: row.bg, border: `1px solid ${row.border}`,
                      }}>
                        {row.label}
                      </span>
                    </td>

                    {/* Spend */}
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {fmtCurrency(row.totalSpend)}
                    </td>

                    {/* Sales */}
                    <td style={{ ...s.td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                      {fmtCurrency(row.totalSales)}
                    </td>

                    {/* Orders */}
                    <td style={{ ...s.td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>
                      {fmtNum(row.totalOrders, 0)}
                    </td>

                    {/* Clicks */}
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {fmtNum(row.totalClicks, 0)}
                    </td>

                    {/* ACoS */}
                    <td style={{
                      ...s.td, textAlign: 'right', fontWeight: 600,
                      color: row.avgAcos === 'NO_SALES'
                        ? '#ef4444'
                        : typeof row.avgAcos === 'number' && row.avgAcos <= thresholds.targetACoS
                          ? '#22c55e' : '#f97316',
                    }}>
                      {row.avgAcos === 'NO_SALES' ? 'No Sales' : fmtPct(row.avgAcos)}
                    </td>

                    {/* ROAS */}
                    <td style={{
                      ...s.td, textAlign: 'right',
                      color: typeof row.avgRoas === 'number' && row.avgRoas >= thresholds.goodROASThreshold
                        ? '#22c55e' : '#ccc',
                    }}>
                      {fmtRoas(row.avgRoas)}
                    </td>

                    {/* CVR */}
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {fmtPct(row.avgCvr)}
                    </td>

                    {/* Reason */}
                    <td style={{ ...s.td, color: '#777', fontSize: 11, maxWidth: 220, whiteSpace: 'normal' }}>
                      {row.reason}
                    </td>

                    {/* Recommended action */}
                    <td style={{ ...s.td, color: '#555', fontSize: 11, fontStyle: 'italic', maxWidth: 220, whiteSpace: 'normal' }}>
                      {row.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Usage note ── */}
      {plan.length > 0 && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: '#3b82f608', border: '1px solid #3b82f622',
          borderRadius: 6, color: '#555', fontSize: 11,
        }}>
          Readiness scores are for review only — no changes are made to Amazon Ads automatically.
          Scores update automatically when you change threshold settings or upload new data.
        </div>
      )}
    </div>
  );
}
