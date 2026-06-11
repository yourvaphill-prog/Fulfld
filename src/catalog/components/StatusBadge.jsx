/**
 * StatusBadge — compact inline badge for a product row.
 * Variants: 'upc-found' | 'no-upc' | 'price-found' | 'no-price' | 'in-stock' | 'out-of-stock'
 */

const STYLES = {
  'upc-found':   { bg: 'rgba(0,255,135,0.10)',  border: 'rgba(0,255,135,0.30)',  color: '#00ff87' },
  'no-upc':      { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', color: '#64748b' },
  'price-found': { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.30)', color: '#3b82f6' },
  'no-price':    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', color: '#64748b' },
  'in-stock':    { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.28)',  color: '#22c55e' },
  'out-of-stock':{ bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.28)',  color: '#ef4444' },
};

const LABELS = {
  'upc-found':    'UPC ✓',
  'no-upc':       'No UPC',
  'price-found':  'Price ✓',
  'no-price':     'No Price',
  'in-stock':     'In Stock',
  'out-of-stock': 'Out of Stock',
};

export default function StatusBadge({ variant }) {
  const style = STYLES[variant] || STYLES['no-upc'];
  const label = LABELS[variant] || variant;

  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      padding:       '2px 7px',
      borderRadius:  4,
      fontSize:      10,
      fontWeight:    600,
      letterSpacing: '0.04em',
      whiteSpace:    'nowrap',
      background:    style.bg,
      border:        `1px solid ${style.border}`,
      color:         style.color,
      fontFamily:    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {label}
    </span>
  );
}
