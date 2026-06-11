/**
 * Tier 2 — WooCommerce / WordPress public REST API fetching.
 *
 * Tries two public endpoints (no auth required):
 *   A. WooCommerce Store API:  /wp-json/wc/store/products
 *   B. WordPress REST API:     /wp-json/wp/v2/product
 *
 * Returns { success, platform, scrapeMethod, products[], total } or { success: false, reason }
 */

import { safeFetch, getBaseUrl } from './urlUtils.js';

const MAX_PRODUCTS = 250;

export async function fetchWooCommerce(userUrl) {
  const base = getBaseUrl(userUrl);
  if (!base) return { success: false, reason: 'Invalid URL' };

  // Try WooCommerce Store API first (richest data, no auth for public stores)
  const storeResult = await tryWooStoreAPI(base);
  if (storeResult.success) return storeResult;

  // Try WordPress REST API product post type
  const wpResult = await tryWpRestAPI(base);
  if (wpResult.success) return wpResult;

  return {
    success: false,
    reason: [storeResult.reason, wpResult.reason].filter(Boolean).join(' | '),
  };
}

// ── WooCommerce Store API (/wp-json/wc/store/products) ────────────────────────

async function tryWooStoreAPI(base) {
  const products = [];
  let page = 1;
  let lastReason = '';

  while (products.length < MAX_PRODUCTS) {
    const url = `${base}/wp-json/wc/store/products?per_page=100&page=${page}`;
    const result = await safeFetch(url, { timeoutMs: 10000 });

    if (!result.ok || !Array.isArray(result.data)) {
      lastReason = `WC Store API page ${page} → HTTP ${result.status || result.error || 'error'}`;
      break;
    }

    const items = result.data;
    if (items.length === 0) break; // last page

    for (const item of items) {
      if (products.length >= MAX_PRODUCTS) break;
      products.push(mapWooStoreProduct(item, base));
    }

    if (items.length < 100) break; // exhausted
    page++;
  }

  if (products.length === 0) {
    return { success: false, reason: lastReason || 'WC Store API returned 0 products' };
  }

  return {
    success:      true,
    platform:     'woocommerce',
    scrapeMethod: 'WooCommerce API',
    products,
    total:        products.length,
  };
}

function mapWooStoreProduct(item, base) {
  // WooCommerce Store API returns prices in minor currency units (cents)
  const rawPrice = item.prices?.price ?? item.prices?.regular_price ?? '';
  const price = rawPrice !== ''
    ? (parseInt(String(rawPrice), 10) / 100).toFixed(2)
    : '';

  // Try to find UPC/GTIN in meta_data array (exposed by some stores)
  const meta = Array.isArray(item.meta_data) ? item.meta_data : [];
  const upcKeys = ['barcode', '_barcode', 'upc', '_upc', 'gtin', '_gtin', 'gtin13', 'ean', '_ean'];
  let upc = '';
  for (const m of meta) {
    if (upcKeys.includes(String(m.key || '').toLowerCase())) {
      const candidate = String(m.value || '').replace(/\D/g, '');
      if (/^\d{8,14}$/.test(candidate)) { upc = candidate; break; }
    }
  }

  const category = Array.isArray(item.categories)
    ? item.categories.map(c => c.name).join(', ')
    : '';

  const productUrl = item.permalink || `${base}/?p=${item.id}`;
  const imageUrl   = item.images?.[0]?.src || '';

  return {
    upc,
    price,
    description:  item.name || '',
    brand:        item.vendor || '',
    sku:          item.sku   || '',
    productUrl,
    imageUrl,
    category,
    variant:      '',
    availability: item.is_in_stock ? 'In Stock' : 'Out of Stock',
    sourceWebsite: base,
    scrapeMethod:  'WooCommerce API',
  };
}

// ── WordPress REST API (/wp-json/wp/v2/product) ───────────────────────────────

async function tryWpRestAPI(base) {
  const url = `${base}/wp-json/wp/v2/product?per_page=100&_embed=1`;
  const result = await safeFetch(url, { timeoutMs: 10000 });

  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return {
      success: false,
      reason: `WP REST API → HTTP ${result.status || result.error || 'error or 0 items'}`,
    };
  }

  const products = result.data.slice(0, MAX_PRODUCTS).map(item => mapWpRestProduct(item, base));

  return {
    success:      true,
    platform:     'wordpress',
    scrapeMethod: 'WooCommerce API',
    products,
    total:        result.data.length,
  };
}

function mapWpRestProduct(item, base) {
  const rawTitle  = item.title?.rendered || '';
  const cleanTitle = decodeHtmlEntities(rawTitle);
  const imageUrl   = item._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  const productUrl = item.link || '';

  return {
    upc:          '',
    price:        '',
    description:  cleanTitle,
    brand:        '',
    sku:          '',
    productUrl,
    imageUrl,
    category:     '',
    variant:      '',
    availability: 'Unknown',
    sourceWebsite: base,
    scrapeMethod:  'WooCommerce API',
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
