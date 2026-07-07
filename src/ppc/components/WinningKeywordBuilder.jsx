import React, { useMemo, useState } from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { T } from '../theme.js';
import { buildWinners } from '../utils/winnerClassifier.js';
import { CONFIDENCE_META } from '../utils/asinUtils.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ppc_winners_excluded';

// Per-tier colours only — label/action/reason text now come from each winner row
// (ASIN-aware) via winnerClassifier.js.
const TIER_COLORS = {
  1: { color: '#22c55e',      bg: '#22c55e11',            border: '#22c55e33' },
  2: { color: T.color.cyan,   bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.30)' },
  3: { color: T.color.cyan,   bg: 'rgba(6,182,212,0.05)', border: 'rgba(6,182,212,0.18)' },
  4: { color: '#f97316',      bg: '#f9731611',            border: '#f9731633' },
  5: { color: '#eab308',      bg: '#eab30811',            border: '#eab30833' },
};

const FILTER_TABS = [
  { key: 'all',      label: 'All' },
  { key: '1',        label: 'High Priority' },
  { key: '2',        label: 'Early Winner' },
  { key: '3',        label: 'Exact / Target' },
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
    'Source ASIN', 'Source SKU', 'Product Title', 'ASIN Confidence',
    'Campaign', 'Ad Group', 'Customer Search Term', 'Term Type',
    'Current Match Type', 'Suggested Action', 'Reason',
    'Spend', 'Sales', 'Orders', 'ACoS (%)', 'ROAS', 'Conv Rate (%)',
  ];

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(r => {
    const acosPct = typeof r.acos === 'number' ? (r.acos * 100).toFixed(1) : '';
    const roasVal = typeof r.roas === 'number'  ? r.roas.toFixed(2)        : '';
    const cvrPct  = typeof r.cvr  === 'number'  ? (r.cvr  * 100).toFixed(1) : '';

    return [
      esc(r.asinDisplay   ?? r.asin ?? ''),
      esc(r.advertisedSku ?? r.sku  ?? ''),
      esc(r.productTitle  ?? ''),
      esc(CONFIDENCE_META[r.asinConfidence]?.label ?? ''),
      esc(r.campaignName ?? ''),
      esc(r.adGroupName  ?? ''),
      esc(r.searchTerm   ?? r.targeting ?? ''),
      esc(r.termType === 'asin' ? 'ASIN (product target)' : 'Keyword'),
      esc(r.matchType    ?? ''),
      esc(r.action ?? ''),
      esc(r.note   ?? ''),
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
  // Secondary row of dropdown facets (ASIN / SKU / Campaign / Ad Group / Term type)
  facetRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  facetGroup: { display: 'flex', flexDirection: 'column', gap: 3 },
  facetLabel: { color: T.color.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.font.mono },
  select: {
    background: T.bg.input, border: `1px solid ${T.border.input}`, borderRadius: T.radius.sm,
    color: T.color.muted, padding: '5px 8px', fontSize: 12, outline: 'none', minWidth: 130,
    fontFamily: T.font.mono, colorScheme: 'dark',
  },
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
    padding: '8px 10px', borderBottom: `1px solid ${T.border.subtle}`, whiteSpace: 'nowrap',
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
  chip: {
    display: 'inline-block', padding: '1px 6px', borderRadius: T.radius.sm,
    fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: T.font.mono, letterSpacing: '0.03em',
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

// Term-type chip colours
const TERM_TYPE_META = {
  keyword: { label: 'KEYWORD', color: T.color.cyan, bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.30)' },
  asin:    { label: 'ASIN TGT', color: '#a855f7',   bg: '#a855f711',           border: '#a855f733' },
};

// Build a sorted, de-duplicated option list from a field.
function optionsFor(rows, getter) {
  const set = new Set();
  for (const r of rows) {
    const v = getter(r);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function WinningKeywordBuilder({ searchTerms, thresholds }) {
  const [excluded,    setExcluded]    = useState(() => loadExcluded());
  const [filterTier,  setFilterTier]  = useState('all');
  const [query,       setQuery]       = useState('');
  const [fAsin,       setFAsin]       = useState('all');
  const [fSku,        setFSku]        = useState('all');
  const [fCampaign,   setFCampaign]   = useState('all');
  const [fAdGroup,    setFAdGroup]    = useState('all');
  const [fTermType,   setFTermType]   = useState('all');

  // Build candidates fresh from props (re-runs when searchTerms or thresholds change)
  const candidates = useMemo(
    () => buildWinners(searchTerms, thresholds),
    [searchTerms, thresholds]
  );

  // Split into active vs excluded
  const active   = useMemo(() => candidates.filter(r => !excluded.has(r.fingerprint)), [candidates, excluded]);
  const excluded_ = useMemo(() => candidates.filter(r =>  excluded.has(r.fingerprint)), [candidates, excluded]);

  // Facet options (from active set)
  const asinOptions     = useMemo(() => optionsFor(active, r => r.asinDisplay ?? r.asin), [active]);
  const skuOptions      = useMemo(() => optionsFor(active, r => r.advertisedSku ?? r.sku), [active]);
  const campaignOptions = useMemo(() => optionsFor(active, r => r.campaignName), [active]);
  const adGroupOptions  = useMemo(() => optionsFor(active, r => r.adGroupName), [active]);

  // Summary stats (active only)
  const summaryStats = useMemo(() => {
    if (!active.length) return null;
    const totalSales   = active.reduce((s, r) => s + (r.sales  ?? 0), 0);
    const totalOrders  = active.reduce((s, r) => s + (r.orders ?? 0), 0);
    const totalSpend   = active.reduce((s, r) => s + (r.spend  ?? 0), 0);
    const keywordWins  = active.filter(r => r.termType === 'keyword').length;
    const targetWins   = active.filter(r => r.termType === 'asin').length;
    const avgAcos      = totalSales  > 0 ? totalSpend / totalSales : null;
    const avgRoas      = totalSpend  > 0 ? totalSales / totalSpend : null;
    return { total: active.length, totalSales, totalOrders, avgAcos, avgRoas, keywordWins, targetWins };
  }, [active]);

  // Filtered rows for table display
  const displayRows = useMemo(() => {
    const source = filterTier === 'excluded' ? excluded_ : active;
    let rows = filterTier === 'all' || filterTier === 'excluded'
      ? source
      : source.filter(r => String(r.tier) === filterTier);

    if (fAsin     !== 'all') rows = rows.filter(r => (r.asinDisplay ?? r.asin) === fAsin);
    if (fSku      !== 'all') rows = rows.filter(r => (r.advertisedSku ?? r.sku) === fSku);
    if (fCampaign !== 'all') rows = rows.filter(r => r.campaignName === fCampaign);
    if (fAdGroup  !== 'all') rows = rows.filter(r => r.adGroupName === fAdGroup);
    if (fTermType !== 'all') rows = rows.filter(r => r.termType === fTermType);

    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(r =>
      (r.searchTerm  ?? r.targeting   ?? '').toLowerCase().includes(q) ||
      (r.campaignName ?? '').toLowerCase().includes(q) ||
      (r.asinDisplay  ?? r.asin ?? '').toLowerCase().includes(q) ||
      (r.productTitle ?? '').toLowerCase().includes(q)
    );
  }, [active, excluded_, filterTier, query, fAsin, fSku, fCampaign, fAdGroup, fTermType]);

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

  const facet = (label, value, setter, options) => (
    <div style={s.facetGroup}>
      <span style={s.facetLabel}>{label}</span>
      <select style={s.select} value={value} onChange={e => setter(e.target.value)}>
        <option value="all">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

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
            <div style={s.summaryLabel}>Keyword Winners</div>
            <div style={{ ...s.summaryValue, color: T.color.cyan }}>{summaryStats.keywordWins}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Target Winners</div>
            <div style={{ ...s.summaryValue, color: '#a855f7' }}>{summaryStats.targetWins}</div>
          </div>
          <div style={s.summaryCard}>
            <div style={s.summaryLabel}>Total Sales</div>
            <div style={{ ...s.summaryValue, color: '#22c55e' }}>{fmtCurrency(summaryStats.totalSales)}</div>
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

      {/* ── Tier filter row ── */}
      <div style={s.filterRow}>
        {FILTER_TABS.map(tab => {
          const active_ = filterTier === tab.key;
          let count = null;
          if (tab.key === 'all')      count = active.length;
          if (tab.key === 'excluded') count = excluded_.length;
          if (['1','2','3','4','5'].includes(tab.key)) count = tierCounts[Number(tab.key)] ?? 0;

          const tc = tab.key !== 'all' && tab.key !== 'excluded' ? TIER_COLORS[Number(tab.key)] : null;
          const activeColor = tc ? tc.color : tab.key === 'excluded' ? T.color.dim : T.color.cyan;

          return (
            <button
              key={tab.key}
              style={{
                ...s.filterBtn,
                color:       active_ ? activeColor : '#666',
                borderColor: active_ ? activeColor + '55' : '#1e1e1e',
                background:  active_ ? (tc ? tc.bg : tab.key === 'excluded' ? `${T.color.dim}11` : 'rgba(6,182,212,0.08)') : 'transparent',
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
          placeholder="Filter by term, ASIN, campaign…"
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

      {/* ── Facet filter row (ASIN / SKU / Campaign / Ad Group / Term type) ── */}
      <div style={s.facetRow}>
        {facet('Advertised ASIN', fAsin, setFAsin, asinOptions)}
        {facet('SKU', fSku, setFSku, skuOptions)}
        {facet('Campaign', fCampaign, setFCampaign, campaignOptions)}
        {facet('Ad Group', fAdGroup, setFAdGroup, adGroupOptions)}
        <div style={s.facetGroup}>
          <span style={s.facetLabel}>Term Type</span>
          <select style={s.select} value={fTermType} onChange={e => setFTermType(e.target.value)}>
            <option value="all">All</option>
            <option value="keyword">Keyword</option>
            <option value="asin">ASIN (product target)</option>
          </select>
        </div>
        {(fAsin !== 'all' || fSku !== 'all' || fCampaign !== 'all' || fAdGroup !== 'all' || fTermType !== 'all') && (
          <button
            style={{ ...s.filterBtn, alignSelf: 'flex-end', color: T.color.dim }}
            onClick={() => { setFAsin('all'); setFSku('all'); setFCampaign('all'); setFAdGroup('all'); setFTermType('all'); }}
          >
            Clear facets
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {displayRows.length === 0 ? (
        <div style={{ ...s.emptyState, padding: '40px 20px' }}>
          <div style={{ color: T.color.dim }}>No terms match this filter</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, minWidth: 220 }}>Customer Search Term</th>
                <th style={{ ...s.th, minWidth: 130 }}>Source ASIN / SKU</th>
                <th style={{ ...s.th, minWidth: 160 }}>Product Title</th>
                <th style={s.th}>Campaign / Ad Group</th>
                <th style={s.th}>Match</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Spend</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Sales</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ACoS</th>
                <th style={{ ...s.th, textAlign: 'right' }}>ROAS</th>
                <th style={{ ...s.th, minWidth: 200 }}>Suggested Action</th>
                <th style={{ ...s.th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const tc = TIER_COLORS[row.tier];
                const isExcluded = excluded.has(row.fingerprint);
                const tt = TERM_TYPE_META[row.termType] ?? TERM_TYPE_META.keyword;
                const conf = CONFIDENCE_META[row.asinConfidence];
                const showConf = row.asinConfidence && row.asinConfidence !== 'exact';

                return (
                  <tr
                    key={row.fingerprint + i}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', opacity: isExcluded ? 0.45 : 1 }}
                  >
                    {/* Search term + reason + tier/term-type chips */}
                    <td style={s.td}>
                      <div style={{ color: T.color.white, fontWeight: 600, fontSize: 12, marginBottom: 3, wordBreak: 'break-word' }}>
                        {row.searchTerm ?? row.targeting ?? '—'}
                      </div>
                      <div style={{ color: T.color.dim, fontSize: 11, marginBottom: 4 }}>
                        {row.note}
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ ...s.tierBadge, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                          {row.label}
                        </span>
                        <span style={{ ...s.chip, background: tt.bg, color: tt.color, border: `1px solid ${tt.border}` }}>
                          {tt.label}
                        </span>
                      </div>
                    </td>

                    {/* Source ASIN / SKU + confidence */}
                    <td style={{ ...s.td, fontSize: 11 }}>
                      <div style={{
                        color: row.asinConfidence === 'unknown' ? T.color.dim : T.color.white,
                        fontWeight: 600,
                      }}>
                        {row.asinDisplay ?? row.asin ?? '—'}
                      </div>
                      {(row.advertisedSku ?? row.sku) && (
                        <div style={{ color: T.color.dim, fontSize: 10, marginTop: 2 }}>{row.advertisedSku ?? row.sku}</div>
                      )}
                      {showConf && conf && (
                        <span style={{ ...s.chip, marginTop: 3, background: conf.bg, color: conf.color, border: `1px solid ${conf.border}` }}>
                          {conf.label}
                        </span>
                      )}
                    </td>

                    {/* Product title */}
                    <td style={{ ...s.td, color: T.color.dim, fontSize: 11, whiteSpace: 'normal', maxWidth: 200 }}>
                      {row.productTitle ?? '—'}
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
                        background: tc.bg, color: tc.color,
                        border: `1px solid ${tc.border}`,
                        whiteSpace: 'normal',
                      }}>
                        {row.action}
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
        </div>
      )}

      {/* ── Usage note ── */}
      {active.length > 0 && filterTier !== 'excluded' && (
        <div style={s.note}>
          Winners are grouped by Advertised ASIN + Customer Search Term — the same term can appear for
          multiple ASINs. Keyword terms recommend <strong>Manual Exact</strong>; ASIN terms recommend{' '}
          <strong>Manual Product Targeting</strong>. Rows tagged <em>Inferred</em> or <em>Unknown ASIN</em> had
          no advertised ASIN in the report — verify before acting. Export CSV includes source ASIN/SKU and the suggested action.
        </div>
      )}
    </div>
  );
}
