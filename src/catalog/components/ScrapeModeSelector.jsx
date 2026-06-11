/**
 * ScrapeModeSelector — three-pill mode switcher for the Website Catalog Scraper.
 *
 * Modes:
 *   fast    — existing 5-tier automatic pipeline (default)
 *   manual  — user pastes product/category URLs (one per line)
 *   browser — Coming Soon / disabled (requires Browserless API key)
 */

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PURPLE = '#a78bfa';
const BORDER = 'rgba(255,255,255,0.07)';

const MODES = [
  {
    id:       'fast',
    icon:     '⚡',
    label:    'Fast Scrape',
    disabled: false,
    tip:      'Automatic 5-tier pipeline: Shopify → WooCommerce → Sitemap → HTML',
  },
  {
    id:       'manual',
    icon:     '📋',
    label:    'Manual URLs',
    disabled: false,
    tip:      'Paste specific product or category page URLs to scrape directly',
  },
  {
    id:       'browser',
    icon:     '🌐',
    label:    'Browser Scrape',
    disabled: true,
    badge:    'Coming Soon',
    tip:      'Requires Browserless API key — not yet enabled',
  },
];

export default function ScrapeModeSelector({ mode, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, color: '#475569',
        letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: FONT,
      }}>
        Scrape Mode
      </span>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODES.map(m => {
          const isActive   = mode === m.id;
          const isDisabled = m.disabled || disabled;

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => !isDisabled && onChange(m.id)}
              title={m.tip}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         5,
                padding:     '6px 11px',
                borderRadius: 7,
                fontSize:    11,
                fontWeight:  isActive ? 700 : 500,
                fontFamily:  FONT,
                cursor:      isDisabled ? 'not-allowed' : 'pointer',
                border:      `1px solid ${isActive ? 'rgba(167,139,250,0.45)' : BORDER}`,
                background:  isActive ? 'rgba(167,139,250,0.13)' : 'rgba(255,255,255,0.03)',
                color:       isActive ? PURPLE : m.disabled ? '#2d3748' : '#64748b',
                opacity:     m.disabled ? 0.42 : 1,
                transition:  'all 0.14s',
                whiteSpace:  'nowrap',
                userSelect:  'none',
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>{m.icon}</span>
              {m.label}
              {m.badge && (
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'rgba(100,116,139,0.18)',
                  color: '#475569',
                  border: '1px solid rgba(100,116,139,0.18)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  marginLeft: 2,
                }}>
                  {m.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
