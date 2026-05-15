import React, { useMemo, useState } from 'react';
import { Download, Copy, CheckCircle } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { healthLabel } from '../utils/healthScore.js';
import { buildScalingPlan, summarisePlan, TIER_META } from '../utils/scalingEngine.js';
import { T } from '../theme.js';

// ── Filter tab definitions ─────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'scale',      label: 'Scale Opportunity' },
  { key: 'optimize',   label: 'Optimize' },
  { key: 'at_risk',    label: 'At Risk' },
  { key: 'needs_data', label: 'Needs More Data' },
  { key: 'pause',      label: 'Pause / Review' },
];

const TAB_COLOR = {
  scale:      '#22c55e',
  optimize:   T.color.cyan,
  at_risk:    '#f97316',
  needs_data: '#eab308',
  pause:      '#ef4444',
  all:        T.color.cyan,
};

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  if (!rows.length) return;

  const headers = [
    'Campaign Name', 'Spend', 'Sales', 'Orders',
    'ACoS (%)', 'ROAS', 'Health Score',
    'Status', 'Budget Change', 'Recommended Action', 'Reason', 'Next Step',
  ];

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(r => {
    const acosPct = typeof r.avgAcos === 'number' ? (r.avgAcos * 100).toFixed(1) : '';
    const roasVal = typeof r.avgRoas === 'number'  ? r.avgRoas.toFixed(2)        : '';
    return [
      esc(r.campaignName   ?? ''),
      esc((r.totalSpend    ?? 0).toFixed(2)),
      esc((r.totalSales    ?? 0).toFixed(2)),
      esc(r.totalOrders    ?? 0),
      esc(acosPct),
      esc(roasVal),
      esc(r.healthScore    ?? ''),
      esc(r.statusLabel    ?? ''),
      esc(r.budgetDelta    ?? ''),
      esc(r.recommendedAction ?? ''),
      esc(r.reason         ?? ''),
      esc(r.nextStep       ?? ''),
    ].join(',');
  });

  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `scaling-plan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Copy summary ───────────────────────────────────────────────────────────────
function buildSummaryText(plan, stats) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const divider = '─'.repeat(44);

  const lines = [
    `PPC Campaign Scaling Plan — ${date}`,
    divider,
    `${stats.total} campaign${stats.total !== 1 ? 's' : ''} analyzed`,
    [
      stats.scaleCount     > 0 ? `${stats.scaleCount} Scale`          : '',
      stats.optimizeCount  > 0 ? `${stats.optimizeCount} Optimize`     : '',
      stats.atRiskCount    > 0 ? `${stats.atRiskCount} At Risk`        : '',
      stats.pauseCount     > 0 ? `${stats.pauseCount} Pause/Review`    : '',
      stats.needsDataCount > 0 ? `${stats.needsDataCount} Needs Data`  : '',
    ].filter(Boolean).join(' · '),
  ];

  if (stats.spendAtRisk > 0) {
    lines.push(`Estimated spend at risk: $${stats.spendAtRisk.toFixed(2)}`);
  }

  const groups = [
    { key: 'scale',      heading: 'SCALE OPPORTUNITIES' },
    { key: 'pause',      heading: 'PAUSE / REVIEW' },
    { key: 'at_risk',    heading: 'AT RISK' },
    { key: 'optimize',   heading: 'OPTIMIZE' },
    { key: 'needs_data', heading: 'NEEDS MORE DATA' },
  ];

  for (const g of groups) {
    const rows = plan.filter(r => r.statusGroup === g.key);
    if (!rows.length) continue;
    lines.push('', g.heading);
    for (const r of rows) {
      lines.push(`• ${r.campaignName} — ${r.reason} → ${r.recommendedAction}`);
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
  actionBtn: (active) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: T.radius.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border:      active ? `1px solid ${T.color.green}44` : `1px solid ${T.border.subtle}`,
    background:  active ? `${T.color.green}11`           : 'transparent',
    color:       active ? T.color.green                  : T.color.dim,
    fontFamily:  T.font.heading,
  }),
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
  badge: (color, bg, border) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: T.radius.sm,
    fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
    color, background: bg, border: `1px solid ${border}`,
  }),
  emptyState: { textAlign: 'center', padding: '60px 20px', color: T.color.dim, fontSize: 13, fontFamily: T.font.mono },
};

// ── Mini health bar (same style as CampaignTable) ──────────────────────────────
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

// ── Component ──────────────────────────────────────────────────────────────────
export default function ScalingPlan({ campaigns, thresholds }) {
  const [filterGroup, setFilterGroup] = useState('all');
  const [query,       setQuery]       = useState('');
  const [copied,      setCopied]      = useState(false);

  // Build plan fresh from props (re-runs when campaigns or thresholds change)
  const plan = useMemo(
    () => buildScalingPlan(campaigns, thresholds),
    [campaigns, thresholds]
  );

  const stats = useMemo(() => summarisePlan(plan), [plan]);

  // Group counts for filter tab badges
  const groupCounts = useMemo(() => {
    const counts = { scale: 0, optimize: 0, at_risk: 0, needs_data: 0, pause: 0 };
    for (const r of plan) {
      if (counts[r.statusGroup] !== undefined) counts[r.statusGroup]++;
    }
    return counts;
  }, [plan]);

  // Filtered rows for display
  const displayRows = useMemo(() => {
    const byGroup = filterGroup === 'all'
      ? plan
      : plan.filter(r => r.statusGroup === filterGroup);
    if (!query.trim()) return byGroup;
    const q = query.toLowerCase();
    return byGroup.filter(r => (r.campaignName ?? '').toLowerCase().includes(q));
  }, [plan, filterGroup, query]);

  function handleCopy() {
    const text = buildSummaryText(plan, stats);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for non-HTTPS/older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Empty state ──
  if (!campaigns.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <div style={{ color: T.color.muted, fontWeight: 600, marginBottom: 6, fontFamily: T.font.heading }}>No campaign data uploaded</div>
        <div style={{ fontFamily: T.font.mono }}>Upload a Campaign Report CSV to generate the scaling plan</div>
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
        <div style={{ ...s.summaryCard, borderColor: stats.scaleCount > 0 ? '#22c55e33' : '#1e1e1e' }}>
          <div style={s.summaryLabel}>Scale ↑</div>
          <div style={{ ...s.summaryValue, color: stats.scaleCount > 0 ? '#22c55e' : '#555' }}>
            {stats.scaleCount}
          </div>
        </div>
        <div style={{ ...s.summaryCard, borderColor: stats.optimizeCount > 0 ? `${T.color.cyan}33` : T.border.base }}>
          <div style={s.summaryLabel}>Optimize</div>
          <div style={{ ...s.summaryValue, color: stats.optimizeCount > 0 ? T.color.cyan : T.color.dim }}>
            {stats.optimizeCount}
          </div>
        </div>
        <div style={{ ...s.summaryCard, borderColor: stats.atRiskCount > 0 ? '#f9731633' : '#1e1e1e' }}>
          <div style={s.summaryLabel}>At Risk</div>
          <div style={{ ...s.summaryValue, color: stats.atRiskCount > 0 ? '#f97316' : '#555' }}>
            {stats.atRiskCount}
          </div>
        </div>
        {stats.pauseCount > 0 && (
          <div style={{ ...s.summaryCard, borderColor: '#ef444433' }}>
            <div style={s.summaryLabel}>Pause / Review</div>
            <div style={{ ...s.summaryValue, color: '#ef4444' }}>{stats.pauseCount}</div>
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
          const tabColor = TAB_COLOR[tab.key] ?? '#3b82f6';
          const count    = tab.key === 'all'
            ? plan.length
            : groupCounts[tab.key] ?? 0;

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
          placeholder="Filter by campaign name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {/* Copy Summary */}
        <button
          style={s.actionBtn(copied)}
          onClick={handleCopy}
          title="Copy scaling plan summary to clipboard"
        >
          {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
          {copied ? 'Copied ✓' : 'Copy Summary'}
        </button>

        {/* Export CSV */}
        <button
          style={{
            ...s.actionBtn(false),
            color:      displayRows.length ? T.color.green : T.color.dim,
            border:     displayRows.length ? `1px solid ${T.color.green}44` : `1px solid ${T.border.subtle}`,
            background: displayRows.length ? `${T.color.green}11` : 'transparent',
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
          <div style={{ color: T.color.dim }}>No campaigns match this filter</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, minWidth: 200 }}>Campaign</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Spend</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Sales</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ACoS</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ROAS</th>
                <th style={s.th}>Health</th>
                <th style={s.th}>Status</th>
                <th style={{ ...s.th, minWidth: 180 }}>Recommended Action</th>
                <th style={{ ...s.th, minWidth: 220 }}>Reason &amp; Next Step</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr
                  key={row.campaignName + i}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                >
                  {/* Campaign name */}
                  <td style={{ ...s.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }} title={row.campaignName}>
                      {row.campaignName}
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
                        ? '#22c55e'
                        : '#f97316',
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

                  {/* Health */}
                  <td style={s.td}>
                    <HealthBadge score={row.healthScore} />
                  </td>

                  {/* Status badge */}
                  <td style={s.td}>
                    <span style={s.badge(row.color, row.bg, row.border)}>
                      {row.statusLabel}
                    </span>
                    {row.budgetDelta && (
                      <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
                        {row.budgetDelta}
                      </div>
                    )}
                  </td>

                  {/* Recommended action */}
                  <td style={{ ...s.td, color: row.color, fontWeight: 600 }}>
                    {row.recommendedAction}
                  </td>

                  {/* Reason + next step */}
                  <td style={s.td}>
                    <div style={{ color: T.color.muted, fontSize: 11, marginBottom: 5 }}>
                      {row.reason}
                    </div>
                    <div style={{ color: T.color.dim, fontSize: 11, fontStyle: 'italic' }}>
                      {row.nextStep}
                    </div>
                  </td>
                </tr>
              ))}
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
          This plan is for review only — no changes are made to Amazon Ads automatically.
          Use the Export CSV to share with your team or import into your own tracking sheet.
        </div>
      )}
    </div>
  );
}
