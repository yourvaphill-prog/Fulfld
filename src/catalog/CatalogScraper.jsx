import { useState } from 'react';
import { Globe2, RefreshCw } from 'lucide-react';
import ScrapeForm          from './components/ScrapeForm.jsx';
import ScrapeModeSelector  from './components/ScrapeModeSelector.jsx';
import ScrapeProgress      from './components/ScrapeProgress.jsx';
import ProductPreviewTable from './components/ProductPreviewTable.jsx';
import ExportButton        from './components/ExportButton.jsx';
import LimitationsNotice   from './components/LimitationsNotice.jsx';

// ── Design tokens — matches App.jsx / UPCScanner.jsx ─────────────────────────
const PURPLE = '#a78bfa';
const BG     = '#080c12';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';
const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Platform badge label map ──────────────────────────────────────────────────
const PLATFORM_LABELS = {
  shopify:     { label: 'Shopify',        color: '#22c55e' },
  woocommerce: { label: 'WooCommerce',    color: '#a78bfa' },
  wordpress:   { label: 'WordPress',      color: '#3b82f6' },
  generic:     { label: 'Generic / HTML', color: '#f59e0b' },
  manual:      { label: 'Manual URLs',    color: '#38bdf8' },
  unknown:     { label: 'Unknown',        color: '#ef4444' },
};

export default function CatalogScraper() {
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState(null);   // last API response
  const [error,        setError]        = useState(null);   // network/parse error (not scrape error)
  const [lastBrand,    setLastBrand]    = useState('');
  const [mode,         setMode]         = useState('fast'); // 'fast' | 'manual' | 'browser'

  function handleModeChange(newMode) {
    // Don't allow switching while loading; reset results when mode changes
    if (loading) return;
    setMode(newMode);
    setResult(null);
    setError(null);
  }

  async function handleScrape({ brandName, websiteUrl, collectionUrl, manualUrls }) {
    // Guard: verify the internal API key is present in this build before making
    // any request. A missing key causes a 401 on every scrape; surface it clearly.
    if (!import.meta.env.VITE_FULFLD_INTERNAL_API_KEY) {
      setError('Internal API key is not configured. Please add VITE_FULFLD_INTERNAL_API_KEY to your .env file and redeploy.');
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setLastBrand(brandName || websiteUrl || 'catalog');

    // Build request body based on mode
    let body;
    if (mode === 'manual') {
      // Parse textarea string → array of trimmed non-empty lines
      const urlArray = String(manualUrls || '')
        .split(/\n|,/)
        .map(u => u.trim())
        .filter(u => u.length > 4);
      body = { mode: 'manual', brandName, manualUrls: urlArray };
    } else {
      body = { mode: 'fast', url: websiteUrl, brandName, collectionUrl };
    }

    try {
      const res = await fetch('/api/catalog-scrape', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_FULFLD_INTERNAL_API_KEY || '',
        },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized API request. Internal API key may be missing or incorrect. Check VITE_FULFLD_INTERNAL_API_KEY in your environment and redeploy.');
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setLastBrand('');
  }

  const products      = result?.products    || [];
  const scrapeMethod  = result?.scrapeMethod;
  const platform      = result?.platform;
  const warnings      = result?.warnings    || [];
  const scrapeError   = result?.error       || null;
  const diagnostics   = result?.diagnostics || null;
  const platformInfo  = PLATFORM_LABELS[platform] || null;
  const hasResults    = products.length > 0;

  // Quality guard: rows are usable only if they have at least one of:
  //   price, UPC, SKU, or a product URL that is NOT just the bare base domain
  // A row with only a homepage URL + logo image is not a real product row.
  const baseOrigin = (() => {
    try { return new URL(result?.products?.[0]?.['Source Website'] || '').origin; } catch { return null; }
  })();
  const usableRows = products.filter(r => {
    if (r['Price']) return true;
    if (r['UPC'])   return true;
    if (r['SKU'])   return true;
    const pUrl = r['Product URL'] || '';
    // Product URL must be more than just the bare homepage
    if (pUrl && pUrl !== baseOrigin && pUrl !== baseOrigin + '/' && pUrl.length > (baseOrigin || '').length + 1) return true;
    return false;
  });
  const hasUsableData = usableRows.length > 0;
  const allRowsUseless = hasResults && !hasUsableData;

  return (
    <div style={{
      minHeight:   '100%',
      background:  BG,
      padding:     '28px 24px 48px',
      overflowY:   'auto',
      fontFamily:  FONT,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'rgba(167,139,250,0.12)',
              border: '1px solid rgba(167,139,250,0.24)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              🌐
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.03em' }}>
                Website Catalog Scraper
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: PURPLE, fontWeight: 600, letterSpacing: '0.05em' }}>
                Extract product catalogs from brand websites
              </p>
            </div>
          </div>

          {/* Platform badge + Reset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {platformInfo && !loading && (
              <span style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                background: `${platformInfo.color}15`,
                border: `1px solid ${platformInfo.color}35`,
                color: platformInfo.color,
              }}>
                {platformInfo.label}
              </span>
            )}
            {(hasResults || scrapeError || error) && (
              <button
                onClick={handleReset}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
                  borderRadius: 7, padding: '6px 12px', color: '#64748b',
                  fontSize: 11, cursor: 'pointer', fontFamily: FONT,
                }}
              >
                <RefreshCw size={11} /> New Search
              </button>
            )}
          </div>
        </div>

        {/* ── Two-column layout on wider screens ───────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left column — form + limitations */}
          <div style={{ flex: '0 0 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Form card */}
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 12, padding: '20px 18px',
              backdropFilter: 'blur(8px)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Purple accent bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${PURPLE}, ${PURPLE}00)` }} />
              <h2 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {mode === 'manual' ? 'Manual URLs' : mode === 'browser' ? 'Browser Scrape' : 'Website Input'}
              </h2>
              <ScrapeModeSelector mode={mode} onChange={handleModeChange} disabled={loading} />
              <ScrapeForm mode={mode} onScrape={handleScrape} loading={loading} />
            </div>

            {/* Limitations */}
            <LimitationsNotice />
          </div>

          {/* Right column — progress + results */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Progress / status */}
            {(loading || result || error) && (
              <ScrapeProgress
                loading={loading}
                scrapeMethod={scrapeMethod}
                warnings={warnings}
                error={scrapeError || error}
                diagnostics={diagnostics}
              />
            )}

            {/* Network/parse error (not a scrape failure) */}
            {!loading && error && !result && (
              <div style={{
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <p style={{ margin: 0, color: '#fca5a5', fontSize: 12, fontFamily: FONT }}>
                  ⚠ {error}
                </p>
              </div>
            )}

            {/* Quality warning — results exist but all are description-only */}
            {!loading && allRowsUseless && (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <p style={{ margin: '0 0 4px', color: '#fca5a5', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                  No usable product catalog data found.
                </p>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 11, fontFamily: FONT, lineHeight: 1.5 }}>
                  The extracted rows contain only page titles with no price, SKU, UPC, URL, or image data.
                  This site likely requires JavaScript rendering or does not expose a public product catalog.
                </p>
              </div>
            )}

            {/* Results section */}
            {!loading && hasResults && !allRowsUseless && (
              <div style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '20px 18px',
                backdropFilter: 'blur(8px)',
              }}>
                {/* Results header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Product Preview
                    </h2>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: '#475569', fontFamily: FONT }}>
                      {products.length} products · Scraped via <strong style={{ color: '#64748b' }}>{scrapeMethod}</strong>
                      {usableRows.length < products.length && (
                        <span style={{ color: '#f59e0b' }}> · {usableRows.length} with usable data</span>
                      )}
                    </p>
                  </div>
                  <ExportButton rows={products} brandName={lastBrand} disabled={allRowsUseless} />
                </div>

                {/* Table */}
                <ProductPreviewTable rows={products} />
              </div>
            )}

            {/* Empty state — scrape ran but returned nothing */}
            {!loading && result && !hasResults && !scrapeError && !error && (
              <div style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '40px 20px',
                backdropFilter: 'blur(8px)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                <p style={{ color: '#64748b', fontSize: 13, fontFamily: FONT }}>
                  No products were found for this URL.
                </p>
              </div>
            )}

            {/* Idle placeholder — nothing tried yet */}
            {!loading && !result && !error && (
              <div style={{
                background: 'rgba(255,255,255,0.015)', border: `1px dashed ${BORDER}`,
                borderRadius: 12, padding: '48px 24px',
                textAlign: 'center',
              }}>
                <Globe2 size={32} style={{ color: '#1e293b', marginBottom: 12 }} />
                {mode === 'manual' ? (
                  <p style={{ margin: 0, color: '#334155', fontSize: 12, fontFamily: FONT, lineHeight: 1.6 }}>
                    Paste product or category URLs (one per line)<br />
                    and click <strong>Scrape URLs</strong> to begin.
                  </p>
                ) : mode === 'browser' ? (
                  <p style={{ margin: 0, color: '#334155', fontSize: 12, fontFamily: FONT, lineHeight: 1.6 }}>
                    Browser Scrape is not yet enabled.<br />
                    Select <strong>Fast Scrape</strong> or <strong>Manual URLs</strong> to continue.
                  </p>
                ) : (
                  <p style={{ margin: 0, color: '#334155', fontSize: 12, fontFamily: FONT, lineHeight: 1.6 }}>
                    Enter a brand website URL and click <strong>Scrape Catalog</strong><br />
                    to begin extraction.
                  </p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Global spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
