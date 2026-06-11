/**
 * HTML page scraping — Tiers 3b, 3c, and 4.
 *
 * scrapeProductPages()    — Tier 3b: scrape a list of discovered individual product URLs
 * scrapeListingPages()    — Tier 3c: extract product cards from category/listing pages
 * scrapeGenericPage()     — Tier 4:  last-resort scrape on the user-submitted URL
 *
 * KEY RULE: A page is only treated as containing a "product" if at least one
 * STRONG product signal is present. A page title or og:title alone is NOT a
 * product signal. This prevents homepage titles from becoming fake product rows.
 *
 * Strong product signals (at least ONE required):
 *   1. JSON-LD @type: Product
 *   2. og:type = "product"
 *   3. product:price:amount meta tag
 *   4. Visible currency price (e.g. $12.99) in the HTML
 *   5. "Add to Cart" / "Buy Now" button text
 *   6. product:retailer_item_id meta tag (SKU)
 *   7. UPC / SKU / GTIN / barcode text pattern
 *   8. URL path contains /product/, /products/, /item/, /shop/ + slug
 */

import { safeFetch, getBaseUrl, normalizeUrl } from './urlUtils.js';

const PAGE_DELAY_MS = 220;

// ── Product signal patterns ───────────────────────────────────────────────────

/** Returns true if the HTML + URL have at least one strong product signal. */
function hasProductSignals(html, url) {
  // ── Early disqualifiers ────────────────────────────────────────────────────
  // og:type = "website" is the standard homepage/non-product marker.
  // If it is explicitly set to "website", no other signal can promote this page.
  if (/og:type["'][^>]*content=["']website["']/i.test(html) ||
      /content=["']website["'][^>]*og:type/i.test(html)) return false;

  // Signal 1: og:type = "product" (explicit Facebook Open Graph product type)
  if (/og:type["'][^>]*content=["']product/i.test(html) ||
      /content=["']product["'][^>]*og:type/i.test(html))   return true;

  // Signal 2: product:price meta (Facebook/OpenGraph commerce tags)
  if (/product:price:amount/i.test(html))   return true;
  if (/og:price:amount/i.test(html))        return true;

  // Signal 3: Explicit retailer SKU meta
  if (/product:retailer_item_id/i.test(html)) return true;

  // Signal 4: Add to Cart / Buy Now button
  if (/(?:add[_\s-]?to[_\s-]?cart|buy[_\s-]?now|add[_\s-]?to[_\s-]?bag|purchase)/i.test(html)) return true;

  // Signal 5: Visible currency price  e.g. $12.99 or £9.50 or USD 10.00
  if (/[\$£€¥₹]\s*[\d,]+\.\d{2}\b/.test(html)) return true;
  if (/\b(?:USD|GBP|EUR|CAD|AUD)\s*[\d,]+\.\d{2}\b/.test(html)) return true;

  // Signal 6: SKU / UPC / GTIN / barcode visible text
  if (/(?:^|\b)(?:sku|upc|gtin|barcode|item\s*#|part\s*no\.?)\s*[:\-]\s*[A-Z0-9]/im.test(html)) return true;

  // Signal 7: URL path itself has product-like slug pattern
  try {
    const path = new URL(normalizeUrl(url) || url).pathname.toLowerCase();
    if (/\/products?\/[^/]+/.test(path)) return true;
    if (/\/items?\/[^/]+/.test(path))    return true;
    if (/\/shop\/[^/]+/.test(path))      return true;
    if (/\/p\/[^/]+/.test(path))         return true;
    if (/\/pd\/[^/]+/.test(path))        return true;
  } catch { /* skip */ }

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Tier 3b — Scrape individual product pages from a discovered URL list.
 * Returns raw product objects (only pages that pass product signal check).
 */
export async function scrapeProductPages(productUrls, base) {
  const products = [];
  for (const url of productUrls) {
    await delay(PAGE_DELAY_MS);
    const result = await safeFetch(url, { timeoutMs: 10000 });
    if (!result.ok || !result.text) continue;

    const html = result.text;
    const sourceWebsite = base || getBaseUrl(url);

    // Priority 1: JSON-LD Product (always valid — no extra signal check needed)
    const jsonLdProduct = extractJsonLdFirst(html, url, sourceWebsite, 'Sitemap + HTML');
    if (jsonLdProduct) { products.push(jsonLdProduct); continue; }

    // Priority 2: OG tags — only if strong signals present
    if (hasProductSignals(html, url)) {
      const ogProduct = extractOpenGraph(html, url, sourceWebsite, 'Sitemap + HTML');
      if (ogProduct) products.push(ogProduct);
    }
  }
  return products;
}

/**
 * Tier 3c — Scrape category/listing pages to extract product card grids.
 * Extracts repeated product-like cards with at least a link + title.
 * Returns raw product objects.
 */
export async function scrapeListingPages(categoryUrls, base) {
  const products = [];
  const seenUrls = new Set();

  for (const url of categoryUrls) {
    await delay(PAGE_DELAY_MS);
    const result = await safeFetch(url, { timeoutMs: 11000 });
    if (!result.ok || !result.text) continue;

    const cards = extractProductCards(result.text, url, base, 'Sitemap + HTML');
    for (const card of cards) {
      if (!seenUrls.has(card.productUrl)) {
        seenUrls.add(card.productUrl);
        products.push(card);
      }
    }
    if (products.length >= 200) break;
  }
  return products;
}

/**
 * Tier 4 — Last-resort generic scrape on the user-submitted URL.
 * Only returns products when STRONG product signals exist.
 * Tries JSON-LD first, then OG (with signal gate), then product card extraction.
 */
export async function scrapeGenericPage(url, base) {
  const result = await safeFetch(url, { timeoutMs: 13000 });

  if (!result.ok || !result.text) {
    return {
      success: false,
      reason: `HTTP ${result.status || 'timeout/error'} — could not fetch the page`,
    };
  }

  const html          = result.text;
  const sourceWebsite = base || getBaseUrl(url);
  const products      = [];

  // Step 1: All JSON-LD Product blocks (reliable — no extra gate needed)
  const jsonLdItems = extractAllJsonLd(html, sourceWebsite, 'Generic HTML');
  products.push(...jsonLdItems);

  // Step 2: OG product tags — gated on product signals
  if (products.length === 0 && hasProductSignals(html, url)) {
    const ogProduct = extractOpenGraph(html, url, sourceWebsite, 'Generic HTML');
    if (ogProduct) products.push(ogProduct);
  }

  // Step 3: Product card extraction (listing/collection page submitted directly)
  if (products.length === 0) {
    const cards = extractProductCards(html, url, sourceWebsite, 'Generic HTML');
    products.push(...cards);
  }

  if (products.length === 0) {
    return {
      success: false,
      reason: 'No product signals found on page (no JSON-LD Product, no product OG tags, no product cards, no Add-to-Cart, no visible price)',
    };
  }

  return { success: true, products };
}

// ── JSON-LD extraction ────────────────────────────────────────────────────────

function extractAllJsonLd(html, sourceWebsite, scrapeMethod) {
  const products = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const json  = JSON.parse(m[1]);
      const items = Array.isArray(json)
        ? json
        : json['@graph']
          ? json['@graph']
          : [json];
      for (const item of items) {
        const p = jsonLdItemToProduct(item, sourceWebsite, scrapeMethod);
        if (p) products.push(p);
      }
    } catch { /* malformed — skip */ }
  }
  return products;
}

function extractJsonLdFirst(html, pageUrl, sourceWebsite, scrapeMethod) {
  const all = extractAllJsonLd(html, sourceWebsite, scrapeMethod);
  if (all.length === 0) return null;
  return all.find(p => p._isProduct) || all[0];
}

function jsonLdItemToProduct(item, sourceWebsite, scrapeMethod) {
  const typeRaw = item['@type'];
  if (!typeRaw) return null;
  const types = (Array.isArray(typeRaw) ? typeRaw : [typeRaw]).map(t => String(t).toLowerCase());
  if (!types.some(t => t.includes('product'))) return null;

  const offersRaw = item.offers || item.Offers;
  let price = '', availability = 'Unknown', offerSku = '', offerGtin = '';

  if (offersRaw) {
    const offer  = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
    price        = String(offer.price ?? offer.lowPrice ?? '');
    const avail  = String(offer.availability || '').toLowerCase();
    if (avail.includes('instock'))     availability = 'In Stock';
    else if (avail.includes('outofstock')) availability = 'Out of Stock';
    offerSku  = String(offer.sku || '');
    offerGtin = extractGtin(offer);
  }

  const gtin  = offerGtin || extractGtin(item);
  const sku   = offerSku  || String(item.sku || item.mpn || '');
  const brand = typeof item.brand === 'object' ? (item.brand?.name || '') : String(item.brand || '');

  return {
    _isProduct:   true,
    upc:          gtin,
    price,
    description:  String(item.name || ''),
    brand,
    sku,
    productUrl:   String(item.url || item['@id'] || ''),
    imageUrl:     extractImage(item.image),
    category:     String(item.category || ''),
    variant:      '',
    availability,
    sourceWebsite,
    scrapeMethod,
  };
}

function extractGtin(obj) {
  const raw = obj.gtin14 || obj.gtin13 || obj.gtin12 || obj.gtin8 || obj.gtin || obj.barcode || '';
  return String(raw).replace(/\D/g, '');
}

function extractImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return extractImage(img[0]);
  if (typeof img === 'object') return String(img.url || img.contentUrl || '');
  return '';
}

// ── Open Graph extraction (gated — only call after hasProductSignals()) ───────

function extractOpenGraph(html, pageUrl, sourceWebsite, scrapeMethod) {
  const getMeta = (prop, attr = 'property') => {
    const re1 = new RegExp(`<meta[^>]+${attr}=["']${escapeRe(prop)}["'][^>]+content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escapeRe(prop)}["']`, 'i');
    const m   = html.match(re1) || html.match(re2);
    return m ? m[1].trim() : '';
  };

  const title    = getMeta('og:title') || getMeta('twitter:title');
  if (!title) return null;  // Need at least an OG title (not just page <title>)

  const imageUrl = getMeta('og:image')  || getMeta('twitter:image') || '';
  const ogUrl    = getMeta('og:url')    || pageUrl;
  const price    = getMeta('product:price:amount') || getMeta('og:price:amount') || extractPriceFromHtml(html);
  const sku      = getMeta('product:retailer_item_id') || extractSkuFromHtml(html);
  const upc      = extractUpcFromHtml(html);

  return {
    upc,
    price,
    description:  title,
    brand:        '',
    sku,
    productUrl:   ogUrl,
    imageUrl,
    category:     '',
    variant:      '',
    availability: 'Unknown',
    sourceWebsite,
    scrapeMethod,
  };
}

// ── Product card extraction (listing/category pages) ─────────────────────────

const PRODUCT_LINK_PATTERNS = [
  /\/products?\/[^/?#]{3,}/i,
  /\/items?\/[^/?#]{3,}/i,
  /\/shop\/[^/?#]{3,}/i,
  /\/store\/[^/?#]{3,}/i,
  /\/collections?\/[^/?#]+\/products?\/[^/?#]{3,}/i,
  /\/catalogue?\/[^/?#]{3,}/i,
  /\/catalog\/[^/?#]{3,}/i,
  /\/pd\/[^/?#]{3,}/i,
  /\/p\/[^/?#]{3,}/i,
];

const CARD_NOISE_RE = /^(?:home|about|contact|blog|news|login|cart|checkout|account|privacy|terms|faq|search|back|next|prev|previous|read more|learn more|shop all|view all|see all|more info)$/i;

/**
 * Extracts product cards from a listing/category page by finding anchor tags
 * whose href matches product-like URL patterns. For each, grabs context window
 * to find title, price, and image.
 *
 * Returns array only if >= 2 distinct product links are found (prevents
 * a single "View Product" link from a non-listing page becoming a false row).
 */
function extractProductCards(html, pageUrl, base, scrapeMethod) {
  const products = [];
  const seen     = new Set();

  // Find all <a href="..."> tags
  const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*?)["'][^>]*>/gi;
  let m;

  while ((m = linkRe.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) continue;

    // Resolve to absolute URL
    let fullUrl;
    try {
      fullUrl = new URL(rawHref, base).href;
    } catch { continue; }

    // Must be same domain
    try {
      if (new URL(fullUrl).hostname !== new URL(base).hostname) continue;
    } catch { continue; }

    // Must match a product-like path pattern
    const path = (() => { try { return new URL(fullUrl).pathname; } catch { return ''; } })();
    if (!PRODUCT_LINK_PATTERNS.some(p => p.test(path))) continue;

    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    // Look at context around this anchor tag
    const ctxStart = Math.max(0, m.index - 400);
    const ctxEnd   = Math.min(html.length, m.index + 800);
    const ctx      = html.slice(ctxStart, ctxEnd);

    // Extract title from: nearby h2/h3/h4, or the anchor's own text, or alt text
    const title = (
      extractTagText(ctx, 'h2') ||
      extractTagText(ctx, 'h3') ||
      extractTagText(ctx, 'h4') ||
      extractTagText(ctx, 'h1') ||
      extractTagText(ctx, 'strong') ||
      extractAnchorText(m[0], html, m.index)
    ).replace(/\s+/g, ' ').trim();

    if (!title || title.length < 3 || title.length > 250) continue;
    if (CARD_NOISE_RE.test(title)) continue;

    const price    = extractPriceFromHtml(ctx);
    const imgMatch = ctx.match(/<img[^>]+src=["']([^"']+)["']/i);
    const imageUrl = imgMatch ? resolveUrl(imgMatch[1], base) : '';

    products.push({
      upc:          '',
      price,
      description:  title,
      brand:        '',
      sku:          extractSkuFromHtml(ctx),
      productUrl:   fullUrl,
      imageUrl,
      category:     '',
      variant:      '',
      availability: 'Unknown',
      sourceWebsite: base,
      scrapeMethod,
    });

    if (products.length >= 100) break;
  }

  // Require at least 2 product cards to be confident it's a listing page
  // (prevents single "shop" buttons from appearing as catalog items)
  return products.length >= 2 ? products : [];
}

// ── HTML text helpers ─────────────────────────────────────────────────────────

function extractTagText(ctx, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]{1,200}?)<\\/${tag}>`, 'i');
  const m  = ctx.match(re);
  return m ? stripTags(m[1]).trim() : '';
}

function extractAnchorText(openTag, html, tagIndex) {
  // Grab text between the opening <a> and next </a>
  const afterOpen = html.indexOf('>', tagIndex) + 1;
  const closeA    = html.indexOf('</a>', afterOpen);
  if (closeA === -1 || closeA - afterOpen > 500) return '';
  return stripTags(html.slice(afterOpen, closeA)).trim();
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveUrl(src, base) {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  try { return new URL(src, base).href; } catch { return src; }
}

// ── Visible text extraction helpers ──────────────────────────────────────────

function extractPriceFromHtml(html) {
  const patterns = [
    /class="[^"]*price[^"]*"[^>]*>\s*[\$£€¥]?\s*([\d,]+\.?\d*)/i,
    /[\$£€¥]\s*([\d,]+\.\d{2})\b/,
    /"price"\s*:\s*"([\d.]+)"/,
    /"price"\s*:\s*([\d.]+)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const cleaned = (m[1] || '').replace(/[^\d.]/g, '');
      if (cleaned && !isNaN(Number(cleaned)) && Number(cleaned) > 0) return cleaned;
    }
  }
  return '';
}

function extractSkuFromHtml(html) {
  const m = html.match(/(?:sku|item\s*#|model|part\s*(?:no\.?|number)?)\s*[:\-]\s*([A-Z0-9][\w\-]{2,29})/i);
  return m ? m[1].trim() : '';
}

function extractUpcFromHtml(html) {
  const m = html.match(/(?:upc|barcode|gtin|ean)\s*[:\-]\s*(\d{8,14})\b/i);
  return m ? m[1].trim() : '';
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
