/**
 * Tier 3a — URL discovery.
 *
 * Finds product page URLs and category/listing page URLs via:
 *   1. Sitemap XML (including sitemap index and robots.txt Sitemap entries)
 *   2. Homepage link extraction (fallback when sitemap is missing or empty)
 *
 * Returns a rich result object with diagnostics counts.
 */

import { safeFetch, getBaseUrl } from './urlUtils.js';

const MAX_PRODUCT_URLS  = 50;
const MAX_CATEGORY_URLS = 20;

// ── URL classification patterns ───────────────────────────────────────────────

const PRODUCT_PATTERNS = [
  /\/products?\/[^/?#]{3,}/i,     // /product/slug or /products/slug
  /\/items?\/[^/?#]{3,}/i,        // /item/slug
  /\/shop\/[^/?#]{3,}/i,          // /shop/slug (not just /shop)
  /\/catalogue?\/[^/?#]{3,}/i,
  /\/catalog\/[^/?#]{3,}/i,
  /\/pd\/[^/?#]{3,}/i,
  /\/p\/[^/?#]{3,}/i,
  /\/merch\/[^/?#]{3,}/i,
  /\/collections?\/[^/?#]+\/products?\/[^/?#]{3,}/i,  // Shopify collection+product
];

const CATEGORY_PATTERNS = [
  /\/collections?\/?$/i,           // /collections  (Shopify collections index)
  /\/collections?\/[^/?#]{2,}/i,  // /collections/skincare
  /\/categories?\/?[^/?#]*/i,     // /category/tools
  /\/shop\/?$/i,                   // /shop (root — listing)
  /\/brands?\/?[^/?#]*/i,         // /brands or /brand/acme
  /\/catalog\/?$/i,
  /\/catalogue?\/?$/i,
  /\/store\/?$/i,
  /\/products?\/?$/i,              // /products (root listing)
  /\/items?\/?$/i,
];

const EXCLUDE_PATTERNS = [
  /\/cart/i, /\/account/i, /\/checkout/i,
  /\/blog/i, /\/blogs/i, /\/news\//i,
  /\/policy/i, /\/policies/i,
  /\/pages\/about/i, /\/pages\/contact/i, /\/pages\/faq/i, /\/pages\/terms/i,
  /\/sitemap/i, /\/tag\//i,
  /\/wp-admin/i, /\/feed/i,
  /\.xml$/i, /\.pdf$/i, /\.jpg$/i, /\.png$/i, /\.gif$/i,
  /\/cdn-cgi\//i,
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Discover product and category URLs for a given website.
 * Returns:
 * {
 *   productUrls:        string[]  — direct product page URLs (max 50)
 *   categoryUrls:       string[]  — listing/category page URLs (max 20)
 *   sitemapFound:       boolean
 *   sitemapProductCount: number
 *   homepageLinksFound: number
 *   reason:             string    — if no URLs found at all
 * }
 */
export async function discoverUrls(userUrl) {
  const base = getBaseUrl(userUrl);
  if (!base) {
    return { productUrls: [], categoryUrls: [], sitemapFound: false, sitemapProductCount: 0, homepageLinksFound: 0, reason: 'Invalid URL' };
  }

  const productSet  = new Set();
  const categorySet = new Set();
  let sitemapFound  = false;

  // ── Step 1: Sitemap discovery ──────────────────────────────────────────────
  const sitemapUrls = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/product-sitemap.xml`,
    `${base}/sitemap_products_1.xml`,
    `${base}/page-sitemap.xml`,
  ];

  const robotsSitemaps = await getSitemapsFromRobots(base);
  for (const s of robotsSitemaps) {
    if (!sitemapUrls.includes(s)) sitemapUrls.push(s);
  }

  for (const sitemapUrl of sitemapUrls) {
    if (productSet.size >= MAX_PRODUCT_URLS) break;
    const { found, productUrls, categoryUrls } = await parseSitemap(sitemapUrl, base);
    if (found) sitemapFound = true;
    for (const u of productUrls)  { productSet.add(u);  if (productSet.size  >= MAX_PRODUCT_URLS)  break; }
    for (const u of categoryUrls) { categorySet.add(u); if (categorySet.size >= MAX_CATEGORY_URLS) break; }
  }

  // ── Step 2: Homepage link discovery (runs always — supplements sitemap) ────
  const homepageLinks = await discoverFromHomepage(base);
  let homepageLinksFound = 0;

  for (const { url, type } of homepageLinks) {
    if (type === 'product' && !productSet.has(url)) {
      productSet.add(url);
      homepageLinksFound++;
      if (productSet.size >= MAX_PRODUCT_URLS) break;
    } else if (type === 'category' && !categorySet.has(url)) {
      categorySet.add(url);
      homepageLinksFound++;
      if (categorySet.size >= MAX_CATEGORY_URLS) break;
    }
  }

  const productUrls  = [...productSet].slice(0, MAX_PRODUCT_URLS);
  const categoryUrls = [...categorySet].slice(0, MAX_CATEGORY_URLS);

  if (productUrls.length === 0 && categoryUrls.length === 0) {
    return {
      productUrls: [], categoryUrls: [],
      sitemapFound, sitemapProductCount: 0, homepageLinksFound,
      reason: 'No product or category URLs found via sitemap or homepage links',
    };
  }

  return {
    productUrls,
    categoryUrls,
    sitemapFound,
    sitemapProductCount: productUrls.length,
    homepageLinksFound,
    reason: '',
  };
}

// Keep the old export name for any callers — wraps the new one
export async function discoverProductUrls(userUrl) {
  const result = await discoverUrls(userUrl);
  if (result.productUrls.length === 0 && result.categoryUrls.length === 0) {
    return { success: false, reason: result.reason };
  }
  return { success: true, productUrls: result.productUrls };
}

// ── Sitemap parsing ───────────────────────────────────────────────────────────

async function getSitemapsFromRobots(base) {
  const result = await safeFetch(`${base}/robots.txt`, { timeoutMs: 5000 });
  if (!result.ok || !result.text) return [];
  const sitemaps = [];
  for (const line of result.text.split('\n')) {
    const m = line.match(/^Sitemap:\s*(.+)/i);
    if (m) sitemaps.push(m[1].trim());
  }
  return sitemaps;
}

async function parseSitemap(sitemapUrl, base, depth = 0) {
  const empty = { found: false, productUrls: [], categoryUrls: [] };
  if (depth > 2) return empty;

  const result = await safeFetch(sitemapUrl, { timeoutMs: 8000 });
  if (!result.ok || !result.text) return empty;

  const text       = result.text;
  const productUrls  = [];
  const categoryUrls = [];

  // Sitemap index — recurse into child sitemaps
  if (text.includes('<sitemapindex') || (text.includes('<sitemap>') && !text.includes('<urlset'))) {
    const childMatches = [...text.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>/gi)];
    let found = false;
    for (const m of childMatches.slice(0, 15)) {
      const childUrl = m[1].trim();
      if (!childUrl) continue;
      const child = await parseSitemap(childUrl, base, depth + 1);
      if (child.found) found = true;
      productUrls.push(...child.productUrls);
      categoryUrls.push(...child.categoryUrls);
      if (productUrls.length >= MAX_PRODUCT_URLS) break;
    }
    return { found, productUrls, categoryUrls };
  }

  // Regular URL sitemap
  const locMatches = [...text.matchAll(/<loc>(.*?)<\/loc>/gi)];
  if (locMatches.length === 0) return empty;

  for (const m of locMatches) {
    const loc = m[1].trim();
    if (!loc) continue;

    const classification = classifyUrl(loc, base);
    if (classification === 'product')  productUrls.push(loc);
    else if (classification === 'category') categoryUrls.push(loc);

    if (productUrls.length >= MAX_PRODUCT_URLS) break;
  }

  return { found: true, productUrls, categoryUrls };
}

// ── Homepage link discovery ───────────────────────────────────────────────────

async function discoverFromHomepage(base) {
  const result = await safeFetch(base, { timeoutMs: 10000 });
  if (!result.ok || !result.text) return [];

  const html  = result.text;
  const links = [];
  const seen  = new Set();

  const linkRe = /<a\s[^>]*href=["']([^"'#?][^"']*)["'][^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) continue;

    let fullUrl;
    try {
      fullUrl = new URL(rawHref, base).href;
      // Same domain only
      if (new URL(fullUrl).hostname !== new URL(base).hostname) continue;
    } catch { continue; }

    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    const classification = classifyUrl(fullUrl, base);
    if (classification) {
      links.push({ url: fullUrl, type: classification });
    }

    if (links.length >= 80) break;
  }

  return links;
}

// ── URL classification ────────────────────────────────────────────────────────

function classifyUrl(url, base) {
  try {
    const parsed   = new URL(url);
    const baseParsed = new URL(base);
    if (parsed.hostname !== baseParsed.hostname) return null;
  } catch { return null; }

  for (const pat of EXCLUDE_PATTERNS) if (pat.test(url)) return null;

  // Check product patterns first (more specific)
  for (const pat of PRODUCT_PATTERNS)  if (pat.test(url)) return 'product';
  // Then category patterns
  for (const pat of CATEGORY_PATTERNS) if (pat.test(url)) return 'category';

  return null;
}
