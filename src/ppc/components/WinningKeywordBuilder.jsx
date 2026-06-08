import React, { useMemo, useState } from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { T } from '../theme.js';
import { buildWinners } from '../utils/winnerClassifier.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ppc_winners_excluded';

const TIER_CONFIG = {
  // Tier 1 — Proven Winner: 3+ orders, good ACoS, strong ROAS
  1: {
    label:  'High Priority Winner',
    action: 'Move to Exact Match — increase bid carefully',
    color:  '#22c55e',
    bg:     '#22c55e11',
    border: '#22c55e33',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)}, ROAS ${fmtRoas(r.roas)} — proven winner, exceeds all targets`,
  },
  // Tier 2 — Early Winner: 1–2 orders, good ACoS, strong ROAS (promising but limited data)
  2: {
    label:  'Early Winner',
    action: 'Add to Exact Match — conservative bid, monitor closely',
    color:  T.color.cyan,
    bg:     'rgba(6,182,212,0.10)',
    border: 'rgba(6,182,212,0.30)',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)}, ROAS ${fmtRoas(r.roas)} — promising early signal, needs more data`,
  },
  // Tier 3 — Test Exact Match: good ACoS but ROAS didn't reach strong threshold
  3: {
    label:  'Move to Exact Match',
    action: 'Test Exact Match',
    color:  T.color.cyan,
    bg:     'rgba(6,182,212,0.05)',
    border: 'rgba(6,182,212,0.18)',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)} — below target ACoS, isolate in Exact Match`,
  },
  // Tier 4 — Increase Bid: slightly above ACoS target but still ROAS-positive
  4: {
    label:  'Increase Bid',
    action: 'Increase Bid Carefully',
    color:  '#f97316',
    bg:     '#f9731611',
    border: '#f9731633',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)} — slightly above target but ROAS ≥ 1; increase bid carefully`,
  },
  // Tier 5 — Keep Monitoring: converting but well above ACoS target
  5: {
    label:  'Keep Monitoring',
    action: 'Monitor – Borderline',
    color:  '#eab308',
    bg:     '#eab30811',
    border: '#eab30833',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)} — converting but above target; monitor trend`,
  },
};

const FILTER_TABS = [
  { key: 'all',      label: 'All' },
  { key: '1',        label: 'High Priority' },
  { key: '2',        label: 'Early Winner' },
  { key: '3',        label: 'Exact Match' },
  { key: '4',        label: 'Increase Bid' },
  { key: '5',        label: 'Monitor' },
  { key: 'excluded', label: 'Excluded' },
];

// ── localStorage helpers ───────────────────────────────────────────────────────
function loadExcluded() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveExcluded(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota / private mode */ }
}

// buildWinners is imported from ../utils/winnerClassifier.js — shared with the API layer.

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  if (!rows.length) return;

  const headers = [
    'Campaign', 'Ad Group', 'Search Term', 'Current Match Type',
    'Suggested Action', 'Reason', 'Spend', 'Sales', 'Orders',
    'ACoS (%)', 'ROAS', 'Conv Rate (%)',
  ];

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(r => {
    const cfg    = TIER_CONFIG[r.tier];
    const acosPct = typeof r.acos === 'number' ? (r.acos * 100).toFixed(1) : '';
    const roasVal = typeof r.roas === 'number'  ? r.roas.toFixed(2)        : '';
    const cvrPct  = typeof r.cvr  === 'number'  ? (r.cvr  * 100).toFixed(1) : '';

    return [
      esc(r.campaignName ?? ''),
      esc(r.adGroupName  ?? ''),
      esc(r.searchTerm   ?? r.targeting ?? ''),
      esc(r.matchType    ?? ''),
      esc(cfg.action),
      esc(cfg.reason(r, {})),
      esc((r.spend  ?? 0).toFixed(2)),
      esc((r.sales  ?? 0).toFixed(2)),
      esc(r.orders  ?? 0),
      esc(acosPct),
      esc(roasVal),
      esc(cvrPct),
    ].join(',');
  });

  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `winning-keywords-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  summaryBar: {
    display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20,
  },
  summaryCard: {
    ...T.glass.card,
    borderRadius: T.radius.md, padding: '12px 18px', minWidth: 130,
  },
  summaryLabel: { color: T.color.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.font.mono },
  summaryValue: { color: T.color.white, fontSize: 20, fontWeight: 700, marginTop: 2, fontFamily: T.font.heading },
  filterRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  filterBtn: {
    padding: '5px 12px', borderRadius: T.radius.sm, border: `1px solid ${T.border.subtle}`,
    background: 'transparent', color: T.color.dim, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    fontFamily: T.font.mono,
  },
  searchBox: {
    marginLeft: 'auto', background: T.bg.input, border: `1px solid ${T.border.input}`,
    borderRadius: T.radius.sm, color: T.color.muted, padding: '5px 10px', fontSize: 12, outline: 'none', width: 200,
    fontFamily: T.font.mono,
  },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: T.radius.sm, border: `1px solid ${T.color.green}44`,
    background: `${T.color.green}11`, color: T.color.green, cursor: 'pointer', fontSize: 12, fontWeight: 700,
    fontFamily: T.font.heading,
  },
  exportBtnDisabled: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: T.radius.sm, border: `1px solid ${T.border.subtle}`,
    background: 'transparent', color: T.color.dim, cursor: 'not-allowed', fontSize: 12, fontWeight: 700,
    fontFamily: T.font.heading,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', color: T.color.dim, fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 10px', borderBottom: `1px solid ${T.border.subtle}`,
    background: T.bg.panel, fontFamily: T.font.mono,
  },
  td: {
    padding: '10px 10px', borderBottom: `1px solid ${T.border.subtle}`,
    color: T.color.muted, fontSize: 12, verticalAlign: 'top', fontFamily: T.font.mono,
  },
  tierBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: T.radius.sm,
    fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: T.font.mono,
  },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '3px 6px', borderRadius: T.radius.sm, display: 'flex', alignItems: 'center',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 20px',
    color: T.color.dim, fontSize: 13, fontFamily: T.font.mono,
  },
  note: {
    marginTop: 16, padding: '10px 14px',
    background: `${T.color.green}08`, border: `1px solid ${T.color.green}22`,
    borderRadius: T.radius.sm, color: T.color.dim, fontSize: 11, fontFamily: T.font.mono,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function WinningKeywordBuilder({ searchTerms, thresholds }) {
  const [excluded,    setExcluded]    = useState(() => loadExcluded());
  const [filterTier,  setFilterTier]  = useState('all');
  const [query,       setQuery]       = useState('');

  // Build candidates fresh from props (re-runs when searchTerms or thresholds change)
  const candidates = useMemo(
    () => buildWinners(searchTerms, thresholds),
    [searchTerms, thresholds]
  );

  // Split into active vs excluded
  const active   = useMemo(() => candidates.filter(r => !excluded.has(r.fingerprint)), [candidates, excluded]);
  const excluded_ = useMemo(() => candidates.filter(r =>  excluded.has(r.fingerprint)), [candidates, excluded]);

  // Summary stats (active only)
  const summaryStats = useMemo(() => {
    if (!active.length) return null;
    const totalSales  = active.reduce((s, r) => s + (r.sales  ?? 0), 0);
    const totalOrders = active.reduce((s, r) => s + (r.orders ?? 0), 0);
    const totalSpend  = active.reduce((s, r) => s + (r.spend  ?? 0), 0);
    const avgAcos     = totalSales  > 0 ? totalSpend / totalSales : null;
    const avgRoas     = totalSpend  > 0 ? totalSales / totalSpend : null;
    return { total: active.length, totalSales, totalOrders, avgAcos, avgRoas };
  }, [active]);

  // Filtered rows for table display
  const displayRows = useMemo(() => {
    const source = filterTier === 'excluded' ? excluded_ : active;
    const byTier = filterTier === 'all' || filterTier === 'excluded'
      ? source
      : source.filter(r => String(r.tier) === filterTier);
    if (!query.trim()) return byTier;
    const q = query.toLowerCase();
    return byTier.filter(r =>
      (r.searchTerm  ?? r.targeting   ?? '').toLowerCase().includes(q) ||
      (r.campaignName ?? '').toLowerCase().includes(q)
    );
  }, [active, excluded_, filterTier, query]);

  function handleExclude(fp) {
    setExcluded(prev => {
      const next = new Set(prev);
      next.add(fp);
      saveExcluded(next);
      return next;
    });
  }

  function handleRestore(fp) {
    setExcluded(prev => {
      const next = new Set(prev);
      next.delete(fp);
      saveExcluded(next);
      return next;
    });
  }

  // Tier counts for filter tab badges (tiers 1–5)
  const tierCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of active) { counts[r.tier] = (counts[r.tier] ?? 0) + 1; }
    return counts;
  }, [active]);

  // ── Empty state ──
  if (!searchTerms.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⭐</div>
        <div style={{ color: '#888', fontWeight: 600, marginBottom: 6 }}>No search term data uploaded</div>
        <div>Upload a Search Term report to identify winning keywords</div>
      </div>
    );
  }

  if (!candidates.length) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
        <div style={{ color: '#888', fontWeight: 600, marginBottom: 6 }}>No winning terms found</div>
        <div>No search terms have orders yet, or all converting terms exceed the monitoring threshold.</div>
        <div style={{ marginTop: 8, color: '#444', fontSize: 11 }}>
          Adjust Target ACoS or Min Orders in Settings to widen the net.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Summary bar ── */}
      {summaryStats && (
        <div style={s.summaryBar}>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Winners</div>
            <div style={s.summaryValue}>{summaryStats.total}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Sales</div>
            <div style={{ ...s.summaryValue, color: '#22c55e' }}>{fmtCurrency(summaryStats.totalSales)}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Orders</div>
            <div style={s.summaryValue}>{fmtNum(summaryStats.totalOrders)}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Avg ACoS</div>
            <div style={{ ...s.summaryValue, fontSize: 18 }}>
              {summaryStats.avgAcos !== null ? fmtPct(summaryStats.avgAcos) : 'N/A'}
            </div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Avg ROAS</div>
            <div style={{ ...s.summaryValue, fontSize: 18 }}>
              {summaryStats.avgRoas !== null ? fmtRoas(summaryStats.avgRoas) : 'N/A'}
            </div>
          </div>
          {excluded_.length > 0 && (
            <div style={{ ...s.summaryCard, borderColor: '#333' }}>
              <div style={s.summaryLabel}>Excluded</div>
              <div style={{ ...s.summaryValue, color: '#555' }}>{excluded_.length}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Filter row ── */}
      <div style={s.filterRow}>
        {FILTER_TABS.map(tab => {
          const active_ = filterTier === tab.key;
          let count = null;
          if (tab.key === 'all')      count = active.length;
          if (tab.key === 'excluded') count = excluded_.length;
          if (['1','2','3','4','5'].includes(tab.key)) count = tierCounts[Number(tab.key)] ?? 0;

          const cfg = tab.key !== 'all' && tab.key !== 'excluded' ? TIER_CONFIG[Number(tab.key)] : null;
          const activeColor = cfg ? cfg.color : tab.key === 'excluded' ? T.color.dim : T.color.cyan;

          return (
            <button
              key={tab.key}
              style={{
                ...s.filterBtn,
                color:       active_ ? activeColor : '#666',
                borderColor: active_ ? activeColor + '55' : '#1e1e1e',
                background:  active_ ? (cfg ? cfg.bg : tab.key === 'excluded' ? `${T.color.dim}11` : 'rgba(6,182,212,0.08)') : 'transparent',
              }}
              onClick={() => setFilterTier(tab.key)}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  marginLeft: 5, background: active_ ? activeColor : 'rgba(255,255,255,0.10)',
                  color: active_ ? '#05080f' : T.color.dim,
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
          placeholder="Filter by term or campaign…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <button
          style={displayRows.length && filterTier !== 'excluded' ? s.exportBtn : s.exportBtnDisabled}
          disabled={!displayRows.length || filterTier === 'excluded'}
          onClick={() => exportCSV(displayRows)}
          title={filterTier === 'excluded' ? 'Switch to an active filter to export' : 'Download CSV'}
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* ── Table ── */}
      {displayRows.length === 0 ? (
        <div style={{ ...s.emptyState, padding: '40px 20px' }}>
          <div style={{ color: T.color.dim }}>No terms match this filter</div>
        </div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Search Term</th>
              <th style={s.th}>Campaign / Ad Group</th>
              <th style={s.th}>Match</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Spend</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Sales</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
              <th style={{ ...s.th, textAlign: 'right' }}>ACoS</th>
              <th style={{ ...s.th, textAlign: 'right' }}>ROAS</th>
              <th style={s.th}>Suggested Action</th>
              <th style={{ ...s.th, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => {
              const cfg = TIER_CONFIG[row.tier];
              const isExcluded = excluded.has(row.fingerprint);

              return (
                <tr
                  key={row.fingerprint + i}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', opacity: isExcluded ? 0.45 : 1 }}
                >
                  {/* Search term + reason */}
                  <td style={s.td}>
                    <div style={{ color: T.color.white, fontWeight: 600, fontSize: 12, marginBottom: 3 }}>
                      {row.searchTerm ?? row.targeting ?? '—'}
                    </div>
                    <div style={{ color: T.color.dim, fontSize: 11 }}>
                      {cfg.reason(row, thresholds)}
                    </div>
                    <span style={{
                      ...s.tierBadge,
                      marginTop: 4,
                      background: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                  </td>

                  {/* Campaign / ad group */}
                  <td style={s.td}>
                    <div style={{ color: T.color.dim, fontSize: 12 }}>{row.campaignName ?? '—'}</div>
                    {row.adGroupName && (
                      <div style={{ color: T.color.dim, fontSize: 11, marginTop: 2 }}>{row.adGroupName}</div>
                    )}
                  </td>

                  {/* Match type */}
                  <td style={{ ...s.td, color: '#888', fontSize: 11 }}>
                    {row.matchType ?? '—'}
                  </td>

                  {/* Spend */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {fmtCurrency(row.spend)}
                  </td>

                  {/* Sales */}
                  <td style={{ ...s.td, textAlign: 'right', color: T.color.green, fontWeight: 600 }}>
                    {fmtCurrency(row.sales)}
                  </td>

                  {/* Orders */}
                  <td style={{ ...s.td, textAlign: 'right', color: T.color.white, fontWeight: 700 }}>
                    {fmtNum(row.orders)}
                  </td>

                  {/* ACoS */}
                  <td style={{
                    ...s.td, textAlign: 'right', fontWeight: 600,
                    color: typeof row.acos === 'number' && row.acos <= thresholds.targetACoS
                      ? T.color.green : T.color.orange,
                  }}>
                    {row.acos === 'NO_SALES' ? '—' : fmtPct(row.acos)}
                  </td>

                  {/* ROAS */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {fmtRoas(row.roas)}
                  </td>

                  {/* Suggested action badge */}
                  <td style={s.td}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px', borderRadius: 4,
                      fontSize: 11, fontWeight: 600,
                      background: cfg.bg, color: cfg.color,
                      border: `1px solid ${cfg.border}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {cfg.action}
                    </span>
                  </td>

                  {/* Exclude / Restore button */}
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {isExcluded ? (
                      <button
                        style={{ ...s.actionBtn, color: T.color.dim }}
                        title="Restore to active list"
                        onClick={() => handleRestore(row.fingerprint)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    ) : (
                      <button
                        style={{ ...s.actionBtn, color: T.color.dim }}
                        title="Exclude from list"
                        onClick={() => handleExclude(row.fingerprint)}
                        onMouseEnter={e => e.currentTarget.style.color = T.color.red}
                        onMouseLeave={e => e.currentTarget.style.color = T.color.dim}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── Usage note ── */}
      {active.length > 0 && filterTier !== 'excluded' && (
        <div style={s.note}>
          Use this list to seed a new Exact Match campaign or promote high performers in your existing structure.
          Export CSV includes the Suggested Action column for each term.
        </div>
      )}
    </div>
  );
}
