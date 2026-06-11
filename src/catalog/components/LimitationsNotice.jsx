import { AlertTriangle } from 'lucide-react';

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BORDER = 'rgba(255,255,255,0.07)';

const ITEMS = [
  'Works best with Shopify stores and WooCommerce / WordPress sites.',
  'Falls back to sitemap discovery and HTML extraction for other platforms.',
  'Sites that require JavaScript rendering, login, or block server requests may fail.',
  'UPC / barcode data is only extracted if the website publicly exposes it — it is never invented.',
  'Version 1 limit: up to 250 products from structured APIs, 50 pages from sitemap discovery.',
  'Always review the extracted data before uploading to UPC Scanner.',
];

export default function LimitationsNotice() {
  return (
    <div style={{
      background:   'rgba(245,158,11,0.04)',
      border:       '1px solid rgba(245,158,11,0.18)',
      borderRadius: 10,
      padding:      '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', fontFamily: FONT, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Notes &amp; Limitations
        </span>
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ITEMS.map((item, i) => (
          <li key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: FONT, lineHeight: 1.55 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
