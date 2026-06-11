/**
 * ScrapeProgress — animated status panel with per-tier diagnostics.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PURPLE = '#a78bfa';
const BORDER = 'rgba(255,255,255,0.07)';

const TIERS = [
  { key: 't1', label: 'Tier 1', title: 'Shopify JSON',           diagKey: 't1_shopify' },
  { key: 't2', label: 'Tier 2', title: 'WooCommerce / WordPress', diagKey: 't2_woocommerce' },
  { key: 't3', label: 'Tier 3', title: 'Sitemap + Homepage links', diagKey: null },
  { key: 't4', label: 'Tier 4', title: 'Generic HTML / JSON-LD',   diagKey: 't4_generic' },
];

export default function ScrapeProgress({ loading, scrapeMethod, warnings, error, diagnostics }) {
  const [showDiag, setShowDiag] = useState(false);
  if (!loading && !scrapeMethod && !error) return null;

  const isManual      = scrapeMethod === 'Manual URL';
  const isGenericHtml = scrapeMethod === 'Generic HTML';

  const succeededTier =
    scrapeMethod === 'Shopify JSON'    ? 't1' :
    scrapeMethod === 'WooCommerce API' ? 't2' :
    scrapeMethod === 'Sitemap + HTML'  ? 't3' :
    scrapeMethod === 'Generic HTML'    ? 't4' : null;

  return (
    <div style={{
      background: 'rgba(13,20,35,0.85)', border: `1px solid ${BORDER}`,
      borderRadius: 10, padding: '14px 16px', backdropFilter: 'blur(8px)',
    }}>

      {/* ── Manual URL status (no tier rows) ── */}
      {isManual ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#22c55e', fontFamily: FONT, fontWeight: 600 }}>
              ✓ Manual URL scrape complete
            </span>
          </div>
          {diagnostics && (
            <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, color: '#475569', fontFamily: FONT }}>
                {diagnostics.manual_urls_submitted} URL{diagnostics.manual_urls_submitted !== 1 ? 's' : ''} submitted
                {' · '}
                {diagnostics.manual_urls_scraped} scraped
                {diagnostics.manual_failed > 0 && (
                  <span style={{ color: '#f59e0b' }}>
                    {' · '}{diagnostics.manual_failed} failed
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      ) : loading ? (
        /* ── Loading state — spinner on first tier ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {TIERS.map((tier, i) => (
            <div key={tier.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {i === 0 ? (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  border: `2px solid rgba(167,139,250,0.3)`, borderTopColor: PURPLE,
                  animation: 'spin 0.8s linear infinite', flexShrink: 0, display: 'inline-block',
                }} />
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#334155', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 10, fontWeight: 600, color: '#475569', fontFamily: FONT, minWidth: 44 }}>
                {tier.label}
              </span>
              <span style={{ fontSize: 11, fontFamily: FONT, color: '#475569' }}>
                {tier.title}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* ── Completed fast-scrape tier rows ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {TIERS.map(tier => {
            const isSucceeded = succeededTier === tier.key;
            const dotColor    = isSucceeded ? '#22c55e' : '#334155';

            return (
              <div key={tier.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: (!isSucceeded && succeededTier) ? 0.35 : 1,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#475569', fontFamily: FONT, minWidth: 44 }}>
                  {tier.label}
                </span>
                <span style={{ fontSize: 11, fontFamily: FONT, color: isSucceeded ? '#22c55e' : '#475569' }}>
                  {isSucceeded ? `✓ ${tier.title}` : tier.title}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Generic HTML warning badge ── */}
      {!loading && isGenericHtml && (
        <div style={{
          marginTop: 12, padding: '7px 10px',
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)',
          borderRadius: 6, display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <span style={{ fontSize: 13 }}>⚠</span>
          <span style={{ fontSize: 11, color: '#fbbf24', fontFamily: FONT }}>
            Generic HTML extraction — review carefully before using.
          </span>
        </div>
      )}

      {/* ── Diagnostics toggle (fast scrape only) ── */}
      {!loading && !isManual && diagnostics && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowDiag(s => !s)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              color: '#475569', fontSize: 10, fontFamily: FONT, padding: '2px 0',
            }}
          >
            {showDiag ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Tier diagnostics
          </button>

          {showDiag && (
            <div style={{
              marginTop: 8, padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`,
              borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <DiagRow label="Shopify"          value={diagnostics.t1_shopify} />
              <DiagRow label="WooCommerce"       value={diagnostics.t2_woocommerce} />
              <DiagRow label="Sitemap"           value={diagnostics.t3_sitemap} />
              <DiagRow label="Homepage links"    value={diagnostics.t3_homepage_links} />
              {diagnostics.t3_pages_scraped > 0 && (
                <DiagRow label="Product pages scraped" value={`${diagnostics.t3_pages_scraped} pages → ${diagnostics.t3_products_found} products`} />
              )}
              {diagnostics.t3c_listing_pages > 0 && (
                <DiagRow label="Listing pages scraped" value={`${diagnostics.t3c_listing_pages} pages → ${diagnostics.t3c_products_found} cards`} />
              )}
              <DiagRow label="Generic HTML"      value={diagnostics.t4_generic} />
            </div>
          )}
        </div>
      )}

      {/* ── Warnings ── */}
      {!loading && warnings && warnings.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginTop: 10 }}>
          {warnings.map((w, i) => (
            <p key={i} style={{ margin: '2px 0', fontSize: 10, color: '#64748b', fontFamily: FONT }}>
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{
          marginTop: 10, padding: '10px 12px',
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 6,
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#fca5a5', fontFamily: FONT, lineHeight: 1.5 }}>
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

function DiagRow({ label, value }) {
  if (!value || value === 'not tried') return null;
  const isOk = String(value).startsWith('✓');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#334155', fontFamily: FONT, minWidth: 130, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: isOk ? '#22c55e' : '#64748b', fontFamily: FONT }}>
        {value}
      </span>
    </div>
  );
}
