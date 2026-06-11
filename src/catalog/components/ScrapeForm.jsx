/**
 * ScrapeForm — mode-aware input form for the Website Catalog Scraper.
 *
 * Props:
 *   mode        string   — 'fast' | 'manual' | 'browser'
 *   onScrape    function — called with { brandName, websiteUrl, collectionUrl, manualUrls }
 *   loading     boolean
 */

import { useState } from 'react';
import { Globe, Tag, FolderOpen, Search, List } from 'lucide-react';

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BORDER = 'rgba(255,255,255,0.07)';
const PURPLE = '#a78bfa';

const inputStyle = {
  width:        '100%',
  background:   'rgba(255,255,255,0.04)',
  border:       `1px solid ${BORDER}`,
  borderRadius: 8,
  padding:      '9px 12px 9px 36px',
  color:        '#e2e8f0',
  fontFamily:   FONT,
  fontSize:     12,
  outline:      'none',
  boxSizing:    'border-box',
  transition:   'border-color 0.15s',
};

const labelStyle = {
  display:       'block',
  color:         '#94a3b8',
  fontSize:      11,
  fontWeight:    600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom:  6,
  fontFamily:    FONT,
};

// Count non-empty lines in a textarea value
function countUrls(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 4).length;
}

export default function ScrapeForm({ mode = 'fast', onScrape, loading }) {
  const [brandName,     setBrandName]     = useState('');
  const [websiteUrl,    setWebsiteUrl]    = useState('');
  const [collectionUrl, setCollectionUrl] = useState('');
  const [manualUrls,    setManualUrls]    = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'fast') {
      if (!websiteUrl.trim()) return;
      onScrape({
        brandName:     brandName.trim(),
        websiteUrl:    websiteUrl.trim(),
        collectionUrl: collectionUrl.trim(),
        manualUrls:    '',
      });
    } else if (mode === 'manual') {
      if (!manualUrls.trim()) return;
      onScrape({
        brandName:     brandName.trim(),
        websiteUrl:    '',
        collectionUrl: '',
        manualUrls:    manualUrls.trim(),
      });
    }
  }

  // ── Browser Scrape — Coming Soon notice, no form ────────────────────────────
  if (mode === 'browser') {
    return (
      <div style={{
        padding:      '16px 14px',
        background:   'rgba(100,116,139,0.06)',
        border:       '1px solid rgba(100,116,139,0.15)',
        borderRadius: 9,
        fontFamily:   FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🌐</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
            Browser Scrape — Coming Soon
          </span>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
          Browser Scrape will use a hosted browser service to render JavaScript-heavy
          websites and automatically discover product catalogs — even for sites that
          require JS execution to display prices and product data.
        </p>
        <p style={{ margin: 0, fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          Requires a <strong style={{ color: '#64748b' }}>Browserless API key</strong>.
          Not yet enabled in this environment.
        </p>
      </div>
    );
  }

  // ── Fast Scrape / Manual URLs ────────────────────────────────────────────────
  const urlCount     = countUrls(manualUrls);
  const overLimit    = urlCount > 50;
  const canSubmitFast   = !loading && websiteUrl.trim().length > 0;
  const canSubmitManual = !loading && urlCount > 0 && !overLimit;
  const canSubmit    = mode === 'fast' ? canSubmitFast : canSubmitManual;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Brand Name — shown in all active modes */}
      <div>
        <label style={labelStyle}>Brand Name</label>
        <div style={{ position: 'relative' }}>
          <Tag size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
          <input
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder="e.g. Acme Beauty"
            style={inputStyle}
            disabled={loading}
          />
        </div>
      </div>

      {/* ── FAST SCRAPE fields ─────────────────────────────────────────────── */}
      {mode === 'fast' && (
        <>
          {/* Website URL */}
          <div>
            <label style={labelStyle}>
              Brand Website URL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Globe size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
              <input
                type="text"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://brand.com"
                style={inputStyle}
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 11, fontFamily: FONT }}>
              The scraper will auto-detect Shopify, WooCommerce, or fall back to sitemap / HTML extraction.
            </p>
          </div>

          {/* Collection URL (optional) */}
          <div>
            <label style={labelStyle}>
              Collection / Category URL{' '}
              <span style={{ color: '#334155', textTransform: 'none', fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ position: 'relative' }}>
              <FolderOpen size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
              <input
                type="text"
                value={collectionUrl}
                onChange={e => setCollectionUrl(e.target.value)}
                placeholder="https://brand.com/collections/skincare"
                style={inputStyle}
                disabled={loading}
              />
            </div>
            <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 11, fontFamily: FONT }}>
              Target a specific Shopify collection or product category page.
            </p>
          </div>
        </>
      )}

      {/* ── MANUAL URLS fields ─────────────────────────────────────────────── */}
      {mode === 'manual' && (
        <div>
          <label style={labelStyle}>
            Product / Category URLs <span style={{ color: '#ef4444' }}>*</span>
          </label>

          {/* URL count badge */}
          {urlCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 10, color: overLimit ? '#ef4444' : '#22c55e', fontFamily: FONT }}>
                {urlCount} URL{urlCount !== 1 ? 's' : ''} entered{overLimit ? ' — max 50' : ''}
              </span>
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <List
              size={13}
              style={{ position: 'absolute', left: 11, top: 10, color: '#475569', pointerEvents: 'none' }}
            />
            <textarea
              value={manualUrls}
              onChange={e => setManualUrls(e.target.value)}
              placeholder={
                'https://brand.com/products/moisturizer-spf30\n' +
                'https://brand.com/collections/skincare\n' +
                'https://brand.com/shop/vitamin-c-serum'
              }
              rows={7}
              disabled={loading}
              style={{
                ...inputStyle,
                padding:    '9px 12px 9px 36px',
                resize:     'vertical',
                lineHeight: 1.6,
                fontFamily: "'Courier New', Courier, monospace",
                fontSize:   11,
                minHeight:  120,
                border:     `1px solid ${overLimit ? 'rgba(239,68,68,0.40)' : BORDER}`,
              }}
            />
          </div>

          <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 11, fontFamily: FONT, lineHeight: 1.5 }}>
            One URL per line · Max 50 URLs · Product pages, category pages, or collection pages.
            Each URL is scraped individually using static HTML extraction.
          </p>
        </div>
      )}

      {/* ── Submit button ──────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            8,
          background:     !canSubmit ? 'rgba(167,139,250,0.06)' : 'rgba(167,139,250,0.15)',
          border:         `1px solid ${!canSubmit ? 'rgba(167,139,250,0.13)' : 'rgba(167,139,250,0.40)'}`,
          borderRadius:   8,
          padding:        '11px 20px',
          color:          !canSubmit ? '#475569' : PURPLE,
          fontSize:       12,
          fontWeight:     700,
          fontFamily:     FONT,
          letterSpacing:  '0.06em',
          textTransform:  'uppercase',
          cursor:         !canSubmit ? 'not-allowed' : 'pointer',
          transition:     'all 0.15s',
          width:          '100%',
          marginTop:      4,
        }}
      >
        {loading ? (
          <>
            <span style={{
              width: 12, height: 12, border: '2px solid rgba(167,139,250,0.3)',
              borderTopColor: PURPLE, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            {mode === 'manual' ? 'Scraping URLs…' : 'Scanning…'}
          </>
        ) : (
          <>
            <Search size={13} />
            {mode === 'manual' ? `Scrape URL${urlCount !== 1 ? 's' : ''}` : 'Scrape Catalog'}
          </>
        )}
      </button>

    </form>
  );
}
