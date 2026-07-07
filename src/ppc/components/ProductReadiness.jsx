import React, { useMemo, useState } from 'react';
import { Download, Copy, CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { buildReadinessPlan, summariseReadiness, READINESS_META } from '../utils/adReadinessScore.js';
import { T } from '../theme.js';

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
    'Winning Keywords', 'Winning Product Targets', 'Negative Candidates', 'Spend at Risk',
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
      esc(r.winningKeywordsCount    ?? 0),
      esc(r.winningTargetsCount     ?? 0),
      esc(r.negativeCandidatesCount ?? 0),
      esc((r.spendWasted     ?? 0).toFixed(2)),
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
      const counts = `[${r.winningKeywordsCount ?? 0} kw · ${r.winningTargetsCount ?? 0} tgt · ${r.negativeCandidatesCount ?? 0} neg]`;
      lines.push(`• ${id} ${counts} — ${r.reason} → ${r.action}`);
    }
  }

  return lines.join('\n');
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  summaryBar: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  summaryCard: {
    ...T.glass.card,
    borderRadius: T.radius.md, padding: '12px 18px', minWidth: 130,
  },
  summaryLabel: {
    color: T.color.dim, fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.font.mono,
  },
  summaryValue: { color: T.color.white, fontSize: 20, fontWeight: 700, marginTop: 2, fontFamily: T.font.heading },
  filterRow: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  filterBtn: {
    padding: '5px 12px', borderRadius: T.radius.sm, border: `1px solid ${T.border.subtle}`,
    background: 'transparent', color: T.color.dim, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    fontFamily: T.font.mono,
  },
  searchBox: {
    marginLeft: 'auto', background: T.bg.input, border: `1px solid ${T.border.input}`,
    borderRadius: T.radius.sm, color: T.color.muted, padding: '5px 10px', fontSize: 12,
    outline: 'none', width: 220, fontFamily: T.font.mono,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', color: T.color.dim, fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 10px', borderBottom: `1px solid ${T.border.subtle}`, whiteSpace: 'nowrap',
    background: T.bg.panel, fontFamily: T.font.mono,
  },
  td: {
    padding: '11px 10px', borderBottom: `1px solid ${T.border.subtle}`,
    color: T.color.muted, fontSize: 12, verticalAlign: 'top', fontFamily: T.font.mono,
  },
  countPill: {
    display: 'inline-block', minWidth: 20, textAlign: 'center', padding: '1px 7px',
    borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, fontFamily: T.font.mono,
  },
  emptyState: { textAlign: 'center', padding: '60px 20px', color: T.color.dim, fontSize: 13, fontFamily: T.font.mono },
  // Drawer
  drawer: { background: 'rgba(255,255,255,0.02)', padding: '16px 18px' },
  drawerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 },
  drawerCard: {
    ...T.glass.card, borderRadius: T.radius.sm, padding: '12px 14px',
  },
  drawerTitle: {
    color: T.color.white, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', fontFamily: T.font.mono, marginBottom: 8, display: 'flex',
    alignItems: 'center', gap: 6,
  },
  drawerRow: {
    display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0',
    borderBottom: `1px solid ${T.border.subtle}`, fontSize: 11,
  },
  drawerTerm: { color: T.color.muted, wordBreak: 'break-word', flex: 1 },
  drawerMetric: { color: T.color.dim, whiteSpace: 'nowrap', fontFamily: T.font.mono },
  drawerEmpty: { color: T.color.dim, fontSize: 11, fontStyle: 'italic', fontFamily: T.font.mono },
};

function actionBtn(active, color = '#22c55e') {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: T.radius.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: T.font.heading,
    border:      active ? `1px solid ${color}44` : `1px solid ${T.border.subtle}`,
    background:  active ? `${color}11`           : 'transparent',
    color:       active ? color                  : T.color.dim,
  };
}

// ── Score bar (mirrors CampaignTable / ScalingPlan health bar style) ───────────
// When the score has been capped for insufficient data, show a small "Capped"
// tag so a product never visually looks scale-ready while its label disagrees.
function ScoreBar({ score, color, capped }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 36, height: 5, borderRadius: 3,
        background: `linear-gradient(to right, ${color} ${score}%, ${T.border.base} ${score}%)`,
        flexShrink: 0,
      }} />
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{score}</span>
      {capped && (
        <span
          title="Score capped — not enough data yet to trust this number"
          style={{
            ...s.countPill, color: T.color.dim, background: 'transparent',
            border: `1px solid ${T.border.subtle}`, fontSize: 9, padding: '1px 5px',
          }}
        >
          Capped
        </span>
      )}
    </span>
  );
}

// Small count-pill cell. Zero counts render dim.
function CountCell({ value, color }) {
  const has = (value ?? 0) > 0;
  return (
    <td style={{ ...s.td, textAlign: 'center' }}>
      <span style={{
        ...s.countPill,
        color:      has ? color : T.color.dim,
        background: has ? `${color}18` : 'transparent',
        border:     has ? `1px solid ${color}33` : `1px solid ${T.border.subtle}`,
      }}>
        {value ?? 0}
      </span>
    </td>
  );
}

// ── Detail drawer ──────────────────────────────────────────────────────────────
function DetailDrawer({ row, thresholds, colSpan }) {
  const ins = row.insights;

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, borderBottom: `1px solid ${T.border.subtle}` }}>
        <div style={s.drawer}>
          {/* Suggested next action + reason */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: row.color, fontWeight: 700, fontSize: 13, fontFamily: T.font.heading, marginBottom: 4 }}>
              Suggested next action
            </div>
            <div style={{ color: T.color.muted, fontSize: 12, marginBottom: 4 }}>{row.action}</div>
            <div style={{ color: T.color.dim, fontSize: 11 }}>{row.reason}</div>
            {ins && (
              <div style={{ color: T.color.dim, fontSize: 11, marginTop: 6 }}>
                Spend wasted with no sales:{' '}
                <span style={{ color: row.spendWasted > 0 ? '#ef4444' : T.color.dim, fontWeight: 700 }}>
                  {fmtCurrency(row.spendWasted)}
                </span>
                {' · '}ASIN-level rollup: {ins.suggestedAction}
              </div>
            )}
          </div>

          {!ins ? (
            <div style={s.drawerEmpty}>
              Upload a Search Term Report to see ASIN-level winning keywords, product targets, and negative candidates for this product.
            </div>
          ) : (
            <div style={s.drawerGrid}>
              {/* Top winning keywords */}
              <div style={s.drawerCard}>
                <div style={{ ...s.drawerTitle, color: T.color.cyan }}>
                  Top Winning Keywords <span style={{ color: T.color.dim }}>({ins.winningKeywordsCount})</span>
                </div>
                {ins.topKeywords.length === 0 ? (
                  <div style={s.drawerEmpty}>No winning keywords yet</div>
                ) : ins.topKeywords.map((w, i) => (
                  <div key={i} style={{ ...s.drawerRow, borderBottom: i === ins.topKeywords.length - 1 ? 'none' : s.drawerRow.borderBottom }}>
                    <span style={s.drawerTerm}>{w.searchTerm ?? w.targeting}</span>
                    <span style={s.drawerMetric}>
                      {fmtNum(w.orders)} ord · {fmtPct(w.acos)} · {fmtRoas(w.roas)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Top winning product targets */}
              <div style={s.drawerCard}>
                <div style={{ ...s.drawerTitle, color: '#a855f7' }}>
                  Top Winning Product Targets <span style={{ color: T.color.dim }}>({ins.winningTargetsCount})</span>
                </div>
                {ins.topTargets.length === 0 ? (
                  <div style={s.drawerEmpty}>No winning ASIN targets yet</div>
                ) : ins.topTargets.map((w, i) => (
                  <div key={i} style={{ ...s.drawerRow, borderBottom: i === ins.topTargets.length - 1 ? 'none' : s.drawerRow.borderBottom }}>
                    <span style={s.drawerTerm}>{w.searchTerm ?? w.targeting}</span>
                    <span style={s.drawerMetric}>
                      {fmtNum(w.orders)} ord · {fmtPct(w.acos)} · {fmtRoas(w.roas)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Negative keyword candidates */}
              <div style={s.drawerCard}>
                <div style={{ ...s.drawerTitle, color: '#ef4444' }}>
                  Negative Candidates <span style={{ color: T.color.dim }}>({ins.negativeCount})</span>
                </div>
                {ins.negatives.length === 0 ? (
                  <div style={s.drawerEmpty}>No wasted terms detected</div>
                ) : ins.negatives.map((w, i) => (
                  <div key={i} style={{ ...s.drawerRow, borderBottom: i === ins.negatives.length - 1 ? 'none' : s.drawerRow.borderBottom }}>
                    <span style={s.drawerTerm}>{w.searchTerm ?? w.targeting}</span>
                    <span style={s.drawerMetric}>
                      {fmtCurrency(w.spend)} · {w.negType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ProductReadiness({ products, searchTerms = [], thresholds }) {
  const [filterGroup, setFilterGroup] = useState('all');
  const [query,       setQuery]       = useState('');
  const [copied,      setCopied]      = useState(false);
  const [expanded,    setExpanded]    = useState(() => new Set());

  const plan = useMemo(
    () => buildReadinessPlan(products, thresholds, searchTerms),
    [products, thresholds, searchTerms]
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

  const hasInsights = searchTerms.length > 0;

  function rowId(row, i) {
    return row.asin ?? row.sku ?? `idx-${i}`;
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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

  // Total column count for drawer colSpan
  const COL_COUNT = 13;

  // ── Empty state ──
  if (!products.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
        <div style={{ color: T.color.muted, fontWeight: 600, marginBottom: 6, fontFamily: T.font.heading }}>No product data uploaded</div>
        <div style={{ fontFamily: T.font.mono }}>Upload an Advertised Product Report CSV to generate readiness scores</div>
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

        {hasInsights && (
          <>
            <div style={{ ...s.summaryCard, borderColor: `${T.color.cyan}33` }}>
              <div style={s.summaryLabel}>Winning Keywords</div>
              <div style={{ ...s.summaryValue, color: T.color.cyan }}>{stats.winningKeywordsTotal}</div>
            </div>
            <div style={{ ...s.summaryCard, borderColor: '#a855f733' }}>
              <div style={s.summaryLabel}>Winning Targets</div>
              <div style={{ ...s.summaryValue, color: '#a855f7' }}>{stats.winningTargetsTotal}</div>
            </div>
            <div style={{ ...s.summaryCard, borderColor: '#ef444433' }}>
              <div style={s.summaryLabel}>Negative Candidates</div>
              <div style={{ ...s.summaryValue, color: '#ef4444' }}>{stats.negativeCandidateTotal}</div>
            </div>
          </>
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

        {(stats.spendAtRisk > 0 || stats.spendWastedTotal > 0) && (
          <div style={{ ...s.summaryCard, borderColor: '#ef444433' }}>
            <div style={s.summaryLabel}>Spend at Risk</div>
            <div style={{ ...s.summaryValue, color: '#ef4444', fontSize: 17 }}>
              {fmtCurrency(hasInsights ? stats.spendWastedTotal : stats.spendAtRisk)}
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
                  background:  isActive ? tabColor : 'rgba(255,255,255,0.10)',
                  color:       isActive ? '#05080f' : T.color.dim,
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
          <div style={{ color: T.color.dim }}>No products match this filter</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 28 }}></th>
                <th style={{ ...s.th, minWidth: 140 }}>ASIN / SKU</th>
                <th style={s.th}>Score</th>
                <th style={s.th}>Readiness</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Spend</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Sales</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ACoS</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ROAS</th>
                <th style={{ ...s.th, textAlign: 'center' }} title="Winning keywords for this ASIN">Win KW</th>
                <th style={{ ...s.th, textAlign: 'center' }} title="Winning product targets for this ASIN">Win Tgt</th>
                <th style={{ ...s.th, textAlign: 'center' }} title="Negative keyword candidates for this ASIN">Neg</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Spend at Risk</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const id = rowId(row, i);
                const isOpen = expanded.has(id);
                return (
                  <React.Fragment key={id + i}>
                    <tr
                      style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', cursor: 'pointer' }}
                      onClick={() => toggleExpand(id)}
                    >
                      {/* Expand chevron */}
                      <td style={{ ...s.td, textAlign: 'center', color: T.color.dim }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>

                      {/* ASIN / SKU */}
                      <td style={{ ...s.td, fontFamily: T.font.mono, fontSize: 11, color: T.color.white }}>
                        {row.asin && <div style={{ fontWeight: 600 }}>{row.asin}</div>}
                        {row.sku  && <div style={{ color: T.color.dim, fontSize: 10 }}>{row.sku}</div>}
                      </td>

                      {/* Score bar */}
                      <td style={s.td}>
                        <ScoreBar score={row.score} color={row.color} capped={row.scoreCapped} />
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
                      <td style={{ ...s.td, textAlign: 'right', color: T.color.green, fontWeight: 600 }}>
                        {fmtCurrency(row.totalSales)}
                      </td>

                      {/* Orders */}
                      <td style={{ ...s.td, textAlign: 'right', color: T.color.white, fontWeight: 700 }}>
                        {fmtNum(row.totalOrders, 0)}
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

                      {/* ASIN-level counts */}
                      <CountCell value={row.winningKeywordsCount} color={T.color.cyan} />
                      <CountCell value={row.winningTargetsCount} color="#a855f7" />
                      <CountCell value={row.negativeCandidatesCount} color="#ef4444" />

                      {/* Spend at risk */}
                      <td style={{
                        ...s.td, textAlign: 'right', fontWeight: 600,
                        color: (row.spendWasted ?? 0) > 0 ? '#ef4444' : T.color.dim,
                      }}>
                        {fmtCurrency(row.spendWasted ?? 0)}
                      </td>
                    </tr>

                    {isOpen && (
                      <DetailDrawer row={row} thresholds={thresholds} colSpan={COL_COUNT} />
                    )}
                  </React.Fragment>
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
          background: 'rgba(6,182,212,0.05)', border: `1px solid rgba(6,182,212,0.15)`,
          borderRadius: T.radius.sm, color: T.color.dim, fontSize: 11, fontFamily: T.font.mono,
        }}>
          Click any product row to expand its ASIN-level detail — top winning keywords, product targets, negative candidates,
          and spend wasted. Scores now blend ASIN-level keyword/target performance{hasInsights ? '' : ' (upload a Search Term Report to activate)'}.
          Review only — no changes are made to Amazon Ads automatically.
        </div>
      )}
    </div>
  );
}
