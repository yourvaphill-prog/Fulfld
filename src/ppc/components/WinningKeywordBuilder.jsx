import React, { useMemo, useState } from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ppc_winners_excluded';

const TIER_CONFIG = {
  1: {
    label:  'High Priority Winner',
    action: 'Add to Exact Match',
    color:  '#22c55e',
    bg:     '#22c55e11',
    border: '#22c55e33',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)}, ROAS ${fmtRoas(r.roas)} — exceeds all targets`,
  },
  2: {
    label:  'Move to Exact Match',
    action: 'Test Exact Match',
    color:  '#3b82f6',
    bg:     '#3b82f611',
    border: '#3b82f633',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)} — below target ACoS, isolate in Exact Match`,
  },
  3: {
    label:  'Increase Bid',
    action: 'Increase Bid Carefully',
    color:  '#f97316',
    bg:     '#f9731611',
    border: '#f9731633',
    reason: (r, t) =>
      `${r.orders} order${r.orders !== 1 ? 's' : ''}, ACoS ${fmtPct(r.acos)} — slightly above target but ROAS ≥ 1; increase bid carefully`,
  },
  4: {
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
  { key: '2',        label: 'Exact Match' },
  { key: '3',        label: 'Increase Bid' },
  { key: '4',        label: 'Monitor' },
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

// ── Candidate generation ───────────────────────────────────────────────────────
/**
 * Four-tier classification (first match wins):
 *   Tier 1 — High Priority Winner  : orders >= minOrders AND acos <= targetACoS AND roas >= goodROASThreshold
 *   Tier 2 — Move to Exact Match   : orders > 0 AND acos <= targetACoS  (didn't qualify for Tier 1)
 *   Tier 3 — Increase Bid          : orders > 0 AND acos > targetACoS AND acos <= targetACoS × 1.5 AND roas >= 1
 *   Tier 4 — Keep Monitoring       : orders > 0 AND acos > targetACoS × 1.5
 *
 * Terms with orders === 0 are never included.
 * acos === 'NO_SALES' sentinel is skipped.
 * Deduplication by (term + campaign) fingerprint.
 */
export function buildWinners(searchTerms, thresholds) {
  const t    = thresholds;
  const seen = new Set();
  const out  = [];

  for (const row of searchTerms) {
    const term = (row.searchTerm ?? row.targeting ?? '').trim();
    if (!term) continue;

    // Must have at least one order
    if ((row.orders ?? 0) === 0) continue;

    // Skip rows with no spend signal
    if ((row.spend ?? 0) === 0 && (row.clicks ?? 0) === 0) continue;

    // Skip the NO_SALES sentinel (spend > 0, sales = 0 — can't compute real ACoS)
    if (row.acos === 'NO_SALES') continue;

    const acos = typeof row.acos === 'number' ? row.acos : null;
    const roas = typeof row.roas === 'number' ? row.roas : null;

    const fp = `${term.toLowerCase()}::${(row.campaignName ?? '').toLowerCase()}`;
    if (seen.has(fp)) continue;
    seen.add(fp);

    let tier;

    if (
      (row.orders ?? 0) >= t.minOrders &&
      acos !== null && acos <= t.targetACoS &&
      roas !== null && roas >= t.goodROASThreshold
    ) {
      tier = 1;
    } else if (acos !== null && acos <= t.targetACoS && (row.orders ?? 0) > 0) {
      tier = 2;
    } else if (
      acos !== null && acos > t.targetACoS &&
      acos <= t.targetACoS * 1.5 &&
      roas !== null && roas >= 1
    ) {
      tier = 3;
    } else if (acos !== null && acos > t.targetACoS * 1.5 && (row.orders ?? 0) > 0) {
      tier = 4;
    } else {
      continue; // can't classify
    }

    out.push({ ...row, fingerprint: fp, tier });
  }

  // Sort: Tier 1 → ROAS desc, Tier 2 → orders desc, Tier 3/4 → acos asc
  out.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 1) return (b.roas ?? 0) - (a.roas ?? 0);
    if (a.tier === 2) return (b.orders ?? 0) - (a.orders ?? 0);
    return (a.acos ?? 0) - (b.acos ?? 0);
  });

  return out;
}

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
    background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 8,
    padding: '12px 18px', minWidth: 130,
  },
  summaryLabel: { color: '#555', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryValue: { color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 2 },
  filterRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  filterBtn: {
    padding: '5px 12px', borderRadius: 6, border: '1px solid #1e1e1e',
    background: 'transparent', color: '#666', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  searchBox: {
    marginLeft: 'auto', background: '#0d0d0d', border: '1px solid #1e1e1e',
    borderRadius: 6, color: '#ccc', padding: '5px 10px', fontSize: 12, outline: 'none', width: 200,
  },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, border: '1px solid #22c55e44',
    background: '#22c55e11', color: '#22c55e', cursor: 'pointer', fontSize: 12, fontWeight: 700,
  },
  exportBtnDisabled: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 6, border: '1px solid #333',
    background: 'transparent', color: '#444', cursor: 'not-allowed', fontSize: 12, fontWeight: 700,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', color: '#555', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 10px', borderBottom: '1px solid #1a1a1a',
  },
  td: {
    padding: '10px 10px', borderBottom: '1px solid #111',
    color: '#ccc', fontSize: 12, verticalAlign: 'top',
  },
  tierBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
  },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '3px 6px', borderRadius: 4, display: 'flex', alignItems: 'center',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 20px',
    color: '#555', fontSize: 13,
  },
  note: {
    marginTop: 16, padding: '10px 14px',
    background: '#22c55e08', border: '1px solid #22c55e22',
    borderRadius: 6, color: '#666', fontSize: 11,
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

  // Tier counts for filter tab badges
  const tierCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
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
          if (['1','2','3','4'].includes(tab.key)) count = tierCounts[Number(tab.key)] ?? 0;

          const cfg = tab.key !== 'all' && tab.key !== 'excluded' ? TIER_CONFIG[Number(tab.key)] : null;
          const activeColor = cfg ? cfg.color : tab.key === 'excluded' ? '#555' : '#3b82f6';

          return (
            <button
              key={tab.key}
              style={{
                ...s.filterBtn,
                color:       active_ ? activeColor : '#666',
                borderColor: active_ ? activeColor + '55' : '#1e1e1e',
                background:  active_ ? (cfg ? cfg.bg : tab.key === 'excluded' ? '#55555511' : '#3b82f611') : 'transparent',
              }}
              onClick={() => setFilterTier(tab.key)}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  marginLeft: 5, background: active_ ? activeColor : '#333',
                  color: active_ ? '#fff' : '#999',
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
          <div style={{ color: '#888' }}>No terms match this filter</div>
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
                  style={{ opacity: isExcluded ? 0.45 : 1 }}
                >
                  {/* Search term + reason */}
                  <td style={s.td}>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 12, marginBottom: 3 }}>
                      {row.searchTerm ?? row.targeting ?? '—'}
                    </div>
                    <div style={{ color: '#555', fontSize: 11 }}>
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
                    <div style={{ color: '#aaa', fontSize: 12 }}>{row.campaignName ?? '—'}</div>
                    {row.adGroupName && (
                      <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>{row.adGroupName}</div>
                    )}
                  </td>

                  {/* Match type */}
                  <td style={{ ...s.td, color: '#888', fontSize: 11 }}>
                    {row.matchType ?? '—'}
                  </td>

                  {/* Spend */}
                  <td style={{ ...s.td, textAlign: 'right', color: '#aaa' }}>
                    {fmtCurrency(row.spend)}
                  </td>

                  {/* Sales */}
                  <td style={{ ...s.td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                    {fmtCurrency(row.sales)}
                  </td>

                  {/* Orders */}
                  <td style={{ ...s.td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>
                    {fmtNum(row.orders)}
                  </td>

                  {/* ACoS */}
                  <td style={{
                    ...s.td, textAlign: 'right', fontWeight: 600,
                    color: typeof row.acos === 'number' && row.acos <= thresholds.targetACoS
                      ? '#22c55e' : '#f97316',
                  }}>
                    {row.acos === 'NO_SALES' ? '—' : fmtPct(row.acos)}
                  </td>

                  {/* ROAS */}
                  <td style={{ ...s.td, textAlign: 'right', color: '#aaa' }}>
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
                        style={{ ...s.actionBtn, color: '#555' }}
                        title="Restore to active list"
                        onClick={() => handleRestore(row.fingerprint)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    ) : (
                      <button
                        style={{ ...s.actionBtn, color: '#444' }}
                        title="Exclude from list"
                        onClick={() => handleExclude(row.fingerprint)}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#444'}
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
