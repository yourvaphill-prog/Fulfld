import React, { useMemo, useState } from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { fmtCurrency, fmtNum } from '../utils/metricCalculator.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const NEG_TYPES = ['Negative Exact', 'Negative Phrase', 'Review First'];

const TYPE_COLOR = {
  'Negative Exact':  { color: '#ef4444', bg: '#ef444411', border: '#ef444433' },
  'Negative Phrase': { color: '#f97316', bg: '#f9731611', border: '#f9731633' },
  'Review First':    { color: '#eab308', bg: '#eab30811', border: '#eab30833' },
};

const STORAGE_KEY = 'ppc_negatives_excluded';

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
 * Three-tier classification:
 *   Tier 1 — Negative Exact  : spend >= maxNoOrderSpend  AND  orders === 0
 *   Tier 2 — Negative Phrase : clicks >= minClicks       AND  orders === 0  (below spend threshold)
 *   Tier 3 — Review First    : cpc >= highCPCThreshold   AND  orders === 0  (clicks but low spend)
 *
 * Terms with orders > 0 or sales > 0 are never included.
 * Deduplication by (term + campaign) fingerprint.
 */
function buildCandidates(searchTerms, thresholds) {
  const t    = thresholds;
  const seen = new Set();
  const out  = [];

  for (const row of searchTerms) {
    const term = (row.searchTerm ?? row.targeting ?? '').trim();
    if (!term) continue;

    // Never suggest negating a converting term
    if ((row.orders ?? 0) > 0 || (row.sales ?? 0) > 0) continue;
    // No data worth classifying
    if ((row.spend ?? 0) === 0 && (row.clicks ?? 0) === 0) continue;

    const fp = `${term.toLowerCase()}::${(row.campaignName ?? '').toLowerCase()}`;
    if (seen.has(fp)) continue;
    seen.add(fp);

    let negType, reason;

    if ((row.spend ?? 0) >= t.maxNoOrderSpend) {
      // Tier 1 — highest confidence
      negType = 'Negative Exact';
      reason  = `$${(row.spend ?? 0).toFixed(2)} spent with zero orders — definitive wasted spend`;
    } else if ((row.clicks ?? 0) >= t.minClicks) {
      // Tier 2 — has enough data to judge conversion
      negType = 'Negative Phrase';
      reason  = `${row.clicks} clicks with zero orders — low conversion, check phrase intent`;
    } else if ((row.cpc ?? 0) >= t.highCPCThreshold && (row.clicks ?? 0) > 0) {
      // Tier 3 — expensive but low traffic; watch first
      negType = 'Review First';
      reason  = `High CPC ($${(row.cpc ?? 0).toFixed(2)}) with zero orders — monitor before negating`;
    } else {
      continue; // not enough signal
    }

    out.push({ ...row, fingerprint: fp, negType, reason });
  }

  // Sort: Exact first (spend desc), then Phrase (clicks desc), then Review First
  const TIER = { 'Negative Exact': 0, 'Negative Phrase': 1, 'Review First': 2 };
  out.sort((a, b) => {
    const td = (TIER[a.negType] ?? 9) - (TIER[b.negType] ?? 9);
    return td !== 0 ? td : (b.spend ?? 0) - (a.spend ?? 0);
  });

  return out;
}

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(included, typeOverrides) {
  if (!included.length) return;

  const headers = [
    'Campaign', 'Ad Group', 'Search Term', 'Match Type',
    'Negative Type', 'Reason', 'Spend', 'Clicks', 'Orders', 'Sales',
  ];

  const esc  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = included.map(r => {
    const effectiveType = typeOverrides[r.fingerprint] ?? r.negType;
    return [
      r.campaignName ?? '',
      r.adGroupName  ?? '',
      r.searchTerm   ?? r.targeting ?? '',
      r.matchType    ?? '',
      effectiveType,
      r.reason,
      (r.spend  ?? 0).toFixed(2),
      String(r.clicks  ?? 0),
      String(r.orders  ?? 0),
      (r.sales  ?? 0).toFixed(2),
    ].map(esc).join(',');
  });

  const csv  = [headers.map(esc).join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ppc-negative-keywords-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  container:  { display: 'flex', flexDirection: 'column', gap: 16 },

  // Summary bar
  summaryBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#0d0d14', border: '1px solid #1e1e2e',
    borderRadius: 8, padding: '14px 20px', flexWrap: 'wrap', gap: 12,
  },
  summaryItems: { display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' },
  summaryItem:  { display: 'flex', flexDirection: 'column', padding: '0 20px' },
  summaryValue: { color: '#fff', fontWeight: 700, fontSize: 20, lineHeight: 1.2 },
  summaryLabel: { color: '#555', fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryDivider: { width: 1, height: 36, background: '#1e1e2e', flexShrink: 0 },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: '#1d4ed8', color: '#fff', border: 'none',
    borderRadius: 7, padding: '9px 18px', cursor: 'pointer',
    fontSize: 13, fontWeight: 700, flexShrink: 0,
  },

  // Bulk note
  note: {
    background: '#0d1117', border: '1px solid #1e2a3a',
    borderRadius: 6, padding: '10px 14px',
    color: '#60a5fa', fontSize: 12, lineHeight: 1.6,
  },

  // Filter bar
  filterBar: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  filterBtn: {
    padding: '5px 12px', borderRadius: 20, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#666', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all 0.12s', whiteSpace: 'nowrap',
  },
  searchInput: {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#ccc', padding: '5px 12px', fontSize: 12,
    outline: 'none', marginLeft: 'auto',
  },

  // Table
  tableWrap: { overflowX: 'auto' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: '#0a0a0a', color: '#666', fontWeight: 600, padding: '9px 12px',
    textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
    letterSpacing: '0.05em', borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 12px', borderBottom: '1px solid #141414',
    color: '#ccc', verticalAlign: 'top',
  },

  // Row actions
  removeBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'transparent', border: '1px solid #2a2a2a',
    borderRadius: 5, padding: '4px 9px', cursor: 'pointer',
    fontSize: 11, color: '#555', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  restoreBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'transparent', border: '1px solid #2a2a2a',
    borderRadius: 5, padding: '4px 9px', cursor: 'pointer',
    fontSize: 11, color: '#555', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },

  // Empty states
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '80px 24px', gap: 12, textAlign: 'center',
  },
  emptyFilter: {
    textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13,
  },
};

// ── Filter tab definitions ─────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',             label: 'All'             },
  { key: 'Negative Exact',  label: 'Negative Exact'  },
  { key: 'Negative Phrase', label: 'Negative Phrase' },
  { key: 'Review First',    label: 'Review First'    },
  { key: 'excluded',        label: 'Excluded'        },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function NegativeKeywordBuilder({ searchTerms, thresholds }) {
  const [excluded,      setExcluded]      = useState(loadExcluded);
  const [typeOverrides, setTypeOverrides] = useState({});
  const [filterType,    setFilterType]    = useState('all');
  const [query,         setQuery]         = useState('');

  // ── Derived data ────────────────────────────────────────────────────────────
  const candidates = useMemo(
    () => buildCandidates(searchTerms, thresholds),
    [searchTerms, thresholds]
  );

  const includedCandidates = useMemo(
    () => candidates.filter(c => !excluded.has(c.fingerprint)),
    [candidates, excluded]
  );

  const excludedCandidates = useMemo(
    () => candidates.filter(c =>  excluded.has(c.fingerprint)),
    [candidates, excluded]
  );

  // Estimated wasted spend — Negative Exact + Negative Phrase (not Review First, too uncertain)
  const estimatedWastedSpend = useMemo(() => {
    return includedCandidates
      .filter(c => {
        const eff = typeOverrides[c.fingerprint] ?? c.negType;
        return eff !== 'Review First';
      })
      .reduce((sum, c) => sum + (c.spend ?? 0), 0);
  }, [includedCandidates, typeOverrides]);

  // Per-type counts for filter badges (uses effective type after overrides)
  const typeCounts = useMemo(() => {
    const counts = { 'Negative Exact': 0, 'Negative Phrase': 0, 'Review First': 0 };
    for (const c of includedCandidates) {
      const eff = typeOverrides[c.fingerprint] ?? c.negType;
      if (counts[eff] !== undefined) counts[eff]++;
    }
    return counts;
  }, [includedCandidates, typeOverrides]);

  // Rows to display in the table
  const displayed = useMemo(() => {
    const pool = filterType === 'excluded' ? excludedCandidates : includedCandidates;
    return pool.filter(c => {
      const eff        = typeOverrides[c.fingerprint] ?? c.negType;
      const matchType  = filterType === 'all' || filterType === 'excluded' || eff === filterType;
      const term       = (c.searchTerm ?? c.targeting ?? '').toLowerCase();
      const matchQuery = !query || term.includes(query.toLowerCase());
      return matchType && matchQuery;
    });
  }, [includedCandidates, excludedCandidates, filterType, typeOverrides, query]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  function removeCandidate(fp) {
    setExcluded(prev => {
      const next = new Set([...prev, fp]);
      saveExcluded(next);
      return next;
    });
  }

  function restoreCandidate(fp) {
    setExcluded(prev => {
      const next = new Set([...prev].filter(f => f !== fp));
      saveExcluded(next);
      return next;
    });
  }

  function overrideType(fp, type) {
    setTypeOverrides(prev => ({ ...prev, [fp]: type }));
  }

  // ── Empty states ─────────────────────────────────────────────────────────────
  if (!searchTerms.length) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 36 }}>🚫</div>
        <div style={{ color: '#555', fontSize: 14, fontWeight: 600 }}>No search term data</div>
        <div style={{ color: '#333', fontSize: 12, maxWidth: 380, lineHeight: 1.7 }}>
          Upload a <span style={{ color: '#3b82f6' }}>Search Term Report</span> CSV to automatically
          detect wasted spend and generate negative keyword suggestions.
        </div>
      </div>
    );
  }

  if (!candidates.length) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 36 }}>✅</div>
        <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 600 }}>No negative candidates found</div>
        <div style={{ color: '#333', fontSize: 12, maxWidth: 380, lineHeight: 1.7 }}>
          All search terms with spend have generated at least one order.
          If this seems wrong, check your{' '}
          <span style={{ color: '#3b82f6' }}>Threshold Settings</span> — particularly
          "Max Spend (No Orders)".
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.container}>

      {/* ── Summary bar ── */}
      <div style={s.summaryBar}>
        <div style={s.summaryItems}>
          <div style={{ ...s.summaryItem, paddingLeft: 4 }}>
            <span style={s.summaryValue}>{includedCandidates.length}</span>
            <span style={s.summaryLabel}>Suggested Negatives</span>
          </div>
          <div style={s.summaryDivider} />
          <div style={s.summaryItem}>
            <span style={{ ...s.summaryValue, color: '#ef4444' }}>
              {fmtCurrency(estimatedWastedSpend)}
            </span>
            <span style={s.summaryLabel}>Est. Wasted Spend</span>
          </div>
          <div style={s.summaryDivider} />
          <div style={s.summaryItem}>
            <span style={{ ...s.summaryValue, color: '#555' }}>{excludedCandidates.length}</span>
            <span style={s.summaryLabel}>Excluded</span>
          </div>
        </div>

        <button
          style={{
            ...s.exportBtn,
            opacity: includedCandidates.length ? 1 : 0.4,
            cursor:  includedCandidates.length ? 'pointer' : 'not-allowed',
          }}
          onClick={() => exportCSV(includedCandidates, typeOverrides)}
          disabled={!includedCandidates.length}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Amazon bulk note ── */}
      <div style={s.note}>
        💡 <strong>Export note:</strong> This CSV is formatted for review and manual entry.
        To bulk-upload in Amazon, copy the <strong>Search Term</strong> and{' '}
        <strong>Negative Type</strong> columns into Amazon's Bulk Operations template
        under Negative Keywords.
      </div>

      {/* ── Filter tabs ── */}
      <div style={s.filterBar}>
        {FILTER_TABS.map(f => {
          const active = filterType === f.key;
          const count  =
            f.key === 'all'      ? includedCandidates.length :
            f.key === 'excluded' ? excludedCandidates.length :
            typeCounts[f.key] ?? 0;

          const cfg   = TYPE_COLOR[f.key] ?? {};
          const color = f.key === 'excluded' ? '#555' :
                        f.key === 'all'      ? '#888' :
                        cfg.color            ?? '#888';

          return (
            <button
              key={f.key}
              style={{
                ...s.filterBtn,
                background:  active ? `${color}22` : 'transparent',
                color:       active ? color : '#666',
                borderColor: active ? `${color}55` : '#2a2a2a',
              }}
              onClick={() => setFilterType(f.key)}
            >
              {f.label}
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}

        <input
          style={s.searchInput}
          placeholder="Filter by term…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* ── Table ── */}
      {displayed.length === 0 ? (
        <div style={s.emptyFilter}>No terms match the current filter.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Search Term', 'Campaign', 'Match Type', 'Spend', 'Clicks', 'Orders', 'Negative Type', ''].map(col => (
                  <th key={col} style={s.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((c, i) => {
                const effectiveType = typeOverrides[c.fingerprint] ?? c.negType;
                const cfg           = TYPE_COLOR[effectiveType] ?? TYPE_COLOR['Review First'];
                const isExcluded    = excluded.has(c.fingerprint);

                return (
                  <tr key={c.fingerprint} style={{ background: i % 2 === 0 ? 'transparent' : '#090909' }}>

                    {/* Search Term + reason below */}
                    <td style={{ ...s.td, minWidth: 200 }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>
                        {c.searchTerm ?? c.targeting ?? '—'}
                      </div>
                      <div style={{ color: '#555', fontSize: 11, marginTop: 4, lineHeight: 1.4, maxWidth: 300 }}>
                        {c.reason}
                      </div>
                    </td>

                    {/* Campaign */}
                    <td style={{ ...s.td, color: '#aaa', fontSize: 12, maxWidth: 200 }}>
                      <div style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
                        {c.campaignName ?? '—'}
                      </div>
                      {c.adGroupName && (
                        <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>
                          {c.adGroupName}
                        </div>
                      )}
                    </td>

                    {/* Match Type */}
                    <td style={{ ...s.td, color: '#777', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.matchType ?? '—'}
                    </td>

                    {/* Spend */}
                    <td style={{ ...s.td, color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtCurrency(c.spend)}
                    </td>

                    {/* Clicks */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      {fmtNum(c.clicks, 0)}
                    </td>

                    {/* Orders — always 0 for candidates */}
                    <td style={{ ...s.td, color: '#ef4444', whiteSpace: 'nowrap' }}>0</td>

                    {/* Negative Type — dropdown (active) or static text (excluded) */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      {isExcluded ? (
                        <span style={{ color: '#555', fontSize: 12 }}>{effectiveType}</span>
                      ) : (
                        <select
                          value={effectiveType}
                          onChange={e => overrideType(c.fingerprint, e.target.value)}
                          style={{
                            background:   cfg.bg,
                            color:        cfg.color,
                            border:       `1px solid ${cfg.border}`,
                            borderRadius: 5,
                            padding:      '4px 8px',
                            fontSize:     12,
                            fontWeight:   600,
                            cursor:       'pointer',
                            outline:      'none',
                          }}
                        >
                          {NEG_TYPES.map(t => (
                            <option key={t} value={t} style={{ background: '#0d0d0d', color: '#ccc' }}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Remove / Restore */}
                    <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isExcluded ? (
                        <button
                          style={s.restoreBtn}
                          onClick={() => restoreCandidate(c.fingerprint)}
                          title="Restore to active list"
                          onMouseEnter={e => {
                            e.currentTarget.style.color       = '#22c55e';
                            e.currentTarget.style.borderColor = '#22c55e55';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color       = '#555';
                            e.currentTarget.style.borderColor = '#2a2a2a';
                          }}
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      ) : (
                        <button
                          style={s.removeBtn}
                          onClick={() => removeCandidate(c.fingerprint)}
                          title="Remove from export list"
                          onMouseEnter={e => {
                            e.currentTarget.style.color       = '#ef4444';
                            e.currentTarget.style.borderColor = '#ef444455';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color       = '#555';
                            e.currentTarget.style.borderColor = '#2a2a2a';
                          }}
                        >
                          <X size={12} /> Remove
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
    </div>
  );
}
