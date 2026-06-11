import { useState } from 'react';
import { ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BORDER = 'rgba(255,255,255,0.07)';
const PURPLE = '#a78bfa';

const PAGE_SIZE = 50;

export default function ProductPreviewTable({ rows }) {
  const [page,      setPage]      = useState(0);
  const [sortCol,   setSortCol]   = useState(null);
  const [sortAsc,   setSortAsc]   = useState(true);

  if (!rows || rows.length === 0) return null;

  // ── Sorting ──────────────────────────────────────────────────────────────────
  let sorted = [...rows];
  if (sortCol) {
    sorted.sort((a, b) => {
      const av = String(a[sortCol] || '').toLowerCase();
      const bv = String(b[sortCol] || '').toLowerCase();
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const visible    = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
    setPage(0);
  }

  const upcCount   = rows.filter(r => r['UPC']).length;
  const priceCount = rows.filter(r => r['Price']).length;

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: FONT }}>
          <strong style={{ color: '#e2e8f0' }}>{rows.length}</strong> products
        </span>
        <StatusBadge variant={upcCount > 0 ? 'upc-found' : 'no-upc'} />
        <span style={{ fontSize: 11, color: '#475569', fontFamily: FONT }}>
          {upcCount} with UPC · {rows.length - upcCount} without
        </span>
        <StatusBadge variant={priceCount > 0 ? 'price-found' : 'no-price'} />
        <span style={{ fontSize: 11, color: '#475569', fontFamily: FONT }}>
          {priceCount} with price
        </span>
      </div>

      {/* Table wrapper */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.02)' }}>
              <Th label="Image"          col={null}                     sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={56} />
              <Th label="Description"    col="Product Description"      sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} />
              <Th label="Brand"          col="Brand Name"               sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={110} />
              <Th label="Price"          col="Price"                    sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={80} />
              <Th label="UPC"            col="UPC"                      sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={120} />
              <Th label="SKU"            col="SKU"                      sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={100} />
              <Th label="Variant/Shade"  col="Variant / Shade"          sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={100} />
              <Th label="Availability"   col="Availability"             sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={100} />
              <Th label="Method"         col="Scrape Method"            sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={110} />
              <Th label="Link"           col={null}                     sortCol={sortCol} sortAsc={sortAsc} onSort={toggleSort} width={44} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, idx) => (
              <tr key={idx} style={{
                borderBottom: `1px solid ${BORDER}`,
                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)',
              }}>
                {/* Thumbnail */}
                <td style={{ padding: '6px 10px', textAlign: 'center', width: 56 }}>
                  {row['Image URL'] ? (
                    <img
                      src={row['Image URL']}
                      alt=""
                      style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, display: 'block', margin: '0 auto' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <span style={{ color: '#334155', fontSize: 18 }}>📦</span>
                  )}
                </td>

                {/* Description */}
                <td style={{ padding: '6px 10px', color: '#cbd5e1', maxWidth: 260 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                    {row['Product Description'] || <span style={{ color: '#334155' }}>—</span>}
                  </div>
                </td>

                {/* Brand */}
                <td style={{ padding: '6px 10px', color: '#94a3b8', width: 110 }}>
                  {row['Brand Name'] || <span style={{ color: '#334155' }}>—</span>}
                </td>

                {/* Price */}
                <td style={{ padding: '6px 10px', width: 80 }}>
                  {row['Price']
                    ? <span style={{ color: '#22c55e', fontWeight: 600 }}>${row['Price']}</span>
                    : <span style={{ color: '#334155' }}>—</span>}
                </td>

                {/* UPC */}
                <td style={{ padding: '6px 10px', width: 120 }}>
                  {row['UPC']
                    ? <span style={{ color: '#00ff87', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{row['UPC']}</span>
                    : <StatusBadge variant="no-upc" />}
                </td>

                {/* SKU */}
                <td style={{ padding: '6px 10px', color: '#64748b', width: 100, fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                  {row['SKU'] || <span style={{ color: '#334155' }}>—</span>}
                </td>

                {/* Variant */}
                <td style={{ padding: '6px 10px', color: '#94a3b8', width: 100 }}>
                  {row['Variant / Shade'] || <span style={{ color: '#334155' }}>—</span>}
                </td>

                {/* Availability */}
                <td style={{ padding: '6px 10px', width: 100 }}>
                  {row['Availability'] === 'In Stock'    ? <StatusBadge variant="in-stock" />
                  : row['Availability'] === 'Out of Stock' ? <StatusBadge variant="out-of-stock" />
                  : <span style={{ color: '#475569', fontSize: 10 }}>Unknown</span>}
                </td>

                {/* Scrape Method */}
                <td style={{ padding: '6px 10px', width: 110 }}>
                  <span style={{
                    fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${BORDER}`, borderRadius: 3, padding: '2px 5px',
                    fontFamily: FONT, whiteSpace: 'nowrap',
                  }}>
                    {row['Scrape Method'] || '—'}
                  </span>
                </td>

                {/* Link */}
                <td style={{ padding: '6px 10px', textAlign: 'center', width: 44 }}>
                  {row['Product URL'] ? (
                    <a
                      href={row['Product URL']}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: PURPLE, display: 'inline-flex' }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  ) : <span style={{ color: '#334155' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 12px', color: '#64748b', cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: FONT, fontSize: 11 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 11, color: '#475569', fontFamily: FONT }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 12px', color: '#64748b', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: FONT, fontSize: 11 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Header cell ───────────────────────────────────────────────────────────────
function Th({ label, col, sortCol, sortAsc, onSort, width }) {
  const active = col && sortCol === col;
  return (
    <th
      onClick={() => col && onSort(col)}
      style={{
        padding:       '8px 10px',
        textAlign:     'left',
        fontSize:      9,
        fontWeight:    600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         active ? '#a78bfa' : '#475569',
        cursor:        col ? 'pointer' : 'default',
        whiteSpace:    'nowrap',
        userSelect:    'none',
        width:         width || undefined,
        fontFamily:    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 3, display: 'inline-block', verticalAlign: 'middle' }}>
          {sortAsc ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
        </span>
      )}
    </th>
  );
}
