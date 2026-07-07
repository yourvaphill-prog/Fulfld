import React, { useMemo, useState } from 'react';
import { fmtCurrency, fmtPct, fmtNum, fmtRoas } from '../utils/metricCalculator.js';
import { groupBy } from '../utils/metricCalculator.js';
import { buildAllAsinInsights } from '../utils/asinInsights.js';
import { ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
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
  caretCell: {
    padding: '9px 4px 9px 12px', borderBottom: `1px solid ${T.border.subtle}`,
    color: T.color.dim, width: 24, cursor: 'pointer',
  },
  empty: { textAlign: 'center', padding: '40px 0', color: T.color.dim, fontFamily: T.font.mono },

  // ── Drawer ──
  drawer: { background: 'rgba(255,255,255,0.02)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 },
  drawerHint: { color: T.color.dim, fontSize: 12, fontStyle: 'italic', fontFamily: T.font.mono },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    fontFamily: T.font.mono, display: 'flex', alignItems: 'center', gap: 6,
  },
  miniWrap: { overflowX: 'auto', ...T.glass.card, borderRadius: T.radius.sm },
  miniTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 },
  miniTh: {
    textAlign: 'left', color: T.color.dim, fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.04em', padding: '7px 10px',
    borderBottom: `1px solid ${T.border.subtle}`, whiteSpace: 'nowrap', fontFamily: T.font.mono,
  },
  miniTd: {
    padding: '7px 10px', borderBottom: `1px solid ${T.border.subtle}`,
    color: T.color.muted, whiteSpace: 'nowrap', fontFamily: T.font.mono,
  },
  term: { color: T.color.white, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' },
  sub: { color: T.color.dim },
  actionPill: {
    display: 'inline-block', padding: '1px 8px', borderRadius: T.radius.pill,
    fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: T.font.mono,
  },
  sectionEmpty: { color: T.color.dim, fontSize: 11, fontStyle: 'italic', fontFamily: T.font.mono, padding: '2px 2px 4px' },
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

// ── Drawer mini-table ──────────────────────────────────────────────────────────
function MiniTable({ columns, rows, emptyText }) {
  if (!rows.length) return <div style={s.sectionEmpty}>{emptyText}</div>;
  return (
    <div style={s.miniWrap}>
      <table style={s.miniTable}>
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={{ ...s.miniTh, textAlign: c.align ?? 'left' }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key} style={{ ...s.miniTd, textAlign: c.align ?? 'left', ...(c.tdStyle ?? {}) }}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function termLabel(r) {
  return r.searchTerm ?? r.targeting ?? '—';
}

// ── Detail drawer for one ASIN ──────────────────────────────────────────────────
function AsinDrawer({ row, insights, hasSearchTerms, colSpan }) {
  const id = row.asin ?? row.sku ?? '—';

  let body;
  if (!hasSearchTerms) {
    body = (
      <div style={s.drawerHint}>
        Upload a Search Term Report to see the keywords, product targets, and wasted spend for this ASIN.
      </div>
    );
  } else if (!row.asin) {
    body = (
      <div style={s.drawerHint}>
        This row has no Advertised ASIN, so search-term performance can’t be attributed to it. Upload a report with an
        Advertised ASIN column to map its keywords.
      </div>
    );
  } else if (!insights) {
    body = (
      <div style={s.drawerHint}>
        No search-term rows matched <strong style={{ color: T.color.muted }}>{id}</strong> in the Search Term Report yet.
      </div>
    );
  } else {
    const acos = r => (r.acos === 'NO_SALES' ? '—' : fmtPct(r.acos));
    const actionCell = (label, color) => (
      <span style={{ ...s.actionPill, color, background: `${color}18`, border: `1px solid ${color}44` }}>{label}</span>
    );

    body = (
      <>
        {/* 1 — Winning keywords */}
        <div style={s.section}>
          <div style={{ ...s.sectionTitle, color: T.color.cyan }}>
            Top Winning Keywords <span style={s.sub}>({insights.winningKeywordsCount})</span>
          </div>
          <MiniTable
            emptyText="No winning keywords for this ASIN yet."
            rows={insights.topKeywords}
            columns={[
              { key: 'term', label: 'Search Term', render: r => <span style={s.term} title={termLabel(r)}>{termLabel(r)}</span> },
              { key: 'camp', label: 'Campaign', render: r => <span style={s.sub}>{r.campaignName ?? '—'}</span> },
              { key: 'adg',  label: 'Ad Group', render: r => <span style={s.sub}>{r.adGroupName ?? '—'}</span> },
              { key: 'spend', label: 'Spend', align: 'right', render: r => fmtCurrency(r.spend) },
              { key: 'sales', label: 'Sales', align: 'right', render: r => fmtCurrency(r.sales) },
              { key: 'ord',  label: 'Orders', align: 'right', render: r => fmtNum(r.orders, 0) },
              { key: 'acos', label: 'ACoS', align: 'right', render: acos },
              { key: 'roas', label: 'ROAS', align: 'right', render: r => fmtRoas(r.roas) },
              { key: 'cvr',  label: 'CVR', align: 'right', render: r => fmtPct(r.cvr) },
              { key: 'act',  label: 'Suggested Action', render: () => actionCell('Move to Manual Exact', T.color.cyan) },
            ]}
          />
        </div>

        {/* 2 — Winning product targets */}
        <div style={s.section}>
          <div style={{ ...s.sectionTitle, color: '#a855f7' }}>
            Top Winning ASIN / Product Targets <span style={s.sub}>({insights.winningTargetsCount})</span>
          </div>
          <MiniTable
            emptyText="No winning product targets for this ASIN yet."
            rows={insights.topTargets}
            columns={[
              { key: 'term', label: 'Target ASIN / Term', render: r => <span style={s.term} title={termLabel(r)}>{termLabel(r)}</span> },
              { key: 'camp', label: 'Campaign', render: r => <span style={s.sub}>{r.campaignName ?? '—'}</span> },
              { key: 'adg',  label: 'Ad Group', render: r => <span style={s.sub}>{r.adGroupName ?? '—'}</span> },
              { key: 'spend', label: 'Spend', align: 'right', render: r => fmtCurrency(r.spend) },
              { key: 'sales', label: 'Sales', align: 'right', render: r => fmtCurrency(r.sales) },
              { key: 'ord',  label: 'Orders', align: 'right', render: r => fmtNum(r.orders, 0) },
              { key: 'acos', label: 'ACoS', align: 'right', render: acos },
              { key: 'roas', label: 'ROAS', align: 'right', render: r => fmtRoas(r.roas) },
              { key: 'act',  label: 'Suggested Action', render: () => actionCell('Move to Manual Product Targeting', '#a855f7') },
            ]}
          />
        </div>

        {/* 3 — Negative candidates */}
        <div style={s.section}>
          <div style={{ ...s.sectionTitle, color: '#ef4444' }}>
            Negative Candidates <span style={s.sub}>({insights.negativeCount})</span>
          </div>
          <MiniTable
            emptyText="No negative candidates for this ASIN."
            rows={insights.negatives}
            columns={[
              { key: 'term', label: 'Search Term', render: r => <span style={s.term} title={termLabel(r)}>{termLabel(r)}</span> },
              { key: 'spend', label: 'Spend', align: 'right', render: r => fmtCurrency(r.spend) },
              { key: 'clk',  label: 'Clicks', align: 'right', render: r => fmtNum(r.clicks, 0) },
              { key: 'ord',  label: 'Orders', align: 'right', render: r => fmtNum(r.orders, 0) },
              { key: 'reason', label: 'Reason', render: r => <span style={s.sub}>{r.reason}</span> },
              { key: 'act',  label: 'Suggested Action', render: () => actionCell('Add as Negative', '#ef4444') },
            ]}
          />
        </div>

        {/* 4 — Spend wasted / no sales */}
        <div style={s.section}>
          <div style={{ ...s.sectionTitle, color: '#f97316' }}>
            Spend Wasted / No Sales <span style={s.sub}>({insights.wastedCount}) · {fmtCurrency(insights.spendWasted)}</span>
          </div>
          <MiniTable
            emptyText="No wasted spend for this ASIN."
            rows={insights.wastedTerms}
            columns={[
              { key: 'term', label: 'Term / Target', render: r => <span style={s.term} title={termLabel(r)}>{termLabel(r)}</span> },
              { key: 'spend', label: 'Spend', align: 'right', render: r => fmtCurrency(r.spend) },
              { key: 'clk',  label: 'Clicks', align: 'right', render: r => fmtNum(r.clicks, 0) },
              { key: 'reason', label: 'Reason', render: r => <span style={s.sub}>{r.reason}</span> },
            ]}
          />
        </div>
      </>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, borderBottom: `1px solid ${T.border.subtle}` }}>
        <div style={s.drawer}>{body}</div>
      </td>
    </tr>
  );
}

export default function ProductTable({ products, searchTerms = [], thresholds }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('totalSpend');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(() => new Set());

  const grouped = useMemo(() => {
    const byAsin = groupBy(products, 'asin');
    const bySku = groupBy(products.filter(p => !p.asin), 'sku');
    return [...byAsin, ...bySku];
  }, [products]);

  // Per-ASIN search-term insights, keyed by upper-case ASIN. Rows are attributed
  // strictly by Advertised ASIN, so no ASIN ever shows another product's terms.
  const insightsByAsin = useMemo(
    () => buildAllAsinInsights(searchTerms, thresholds),
    [searchTerms, thresholds]
  );

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

  if (!products.length) {
    return <div style={s.empty}>No product data. Upload an Advertised Product Report CSV to get started.</div>;
  }

  const hasSearchTerms = searchTerms.length > 0;

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
  const colSpan = cols.length + 1; // + caret column

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
              <th style={{ ...s.th, cursor: 'default', width: 24 }} />
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
              const key = rowId(row, i);
              const isOpen = expanded.has(key);
              const insights = row.asin ? (insightsByAsin.get(String(row.asin).toUpperCase()) ?? null) : null;
              return (
                <React.Fragment key={key}>
                  <tr
                    style={{ background: isOpen ? 'rgba(0,229,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', cursor: 'pointer' }}
                    onClick={() => toggleExpand(key)}
                  >
                    <td style={s.caretCell} title={isOpen ? 'Collapse' : 'Expand'}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
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
                  {isOpen && (
                    <AsinDrawer row={row} insights={insights} hasSearchTerms={hasSearchTerms} colSpan={colSpan} />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
