/**
 * Tier 1 — Shopify JSON endpoint fetching.
 *
 * Attempts to fetch product catalog from Shopify's public endpoints:
 *   /products.json?limit=250
 *   /collections/all/products.json?limit=250
 *   /collections/{handle}/products.json?limit=250  (if collectionUrl provided)
 *
 * Returns { success, platform, scrapeMethod, products[], total } or { success: false, reason }
 */

import { safeFetch, getBaseUrl, normalizeUrl } from './urlUtils.js';

const MAX_PRODUCTS = 250;

export async function fetchShopify(userUrl, collectionUrl) {
  const base = getBaseUrl(userUrl);
  if (!base) return { success: false, reason: 'Invalid URL' };

  // Build ordered list of endpoints to try
  const endpoints = [];

  // If user gave a collection URL, try that handle first
  if (collectionUrl) {
    const handle = extractCollectionHandle(collectionUrl);
    if (handle && handle !== 'all') {
      endpoints.push(`${base}/collections/${handle}/products.json?limit=250`);
    }
  }

  endpoints.push(`${base}/products.json?limit=250`);
  endpoints.push(`${base}/collections/all/products.json?limit=250`);

  const reasons = [];

  for (const endpoint of endpoints) {
    const result = await safeFetch(endpoint, { timeoutMs: 13000 });

    // Detect password-protected Shopify stores
    if (result.url && result.url.includes('/password')) {
      return {
        success: false,
        reason: 'This Shopify store is password-protected and requires a login to view products.',
      };
    }
    if (result.text && result.text.includes('password_page')) {
      return {
        success: false,
        reason: 'This Shopify store is password-protected.',
      };
    }

    if (!result.ok) {
      reasons.push(`${endpoint} → HTTP ${result.status || result.error || 'error'}`);
      continue;
    }

    const data = result.data;
    if (!data || !Array.isArray(data.products)) {
      reasons.push(`${endpoint} → response missing products array`);
      continue;
    }

    if (data.products.length === 0) {
      reasons.push(`${endpoint} → 0 products returned`);
      continue;
    }

    // ── Got products — expand variants ─────────────────────────────────────
    const products = [];
    const seen = new Set();

    for (const product of data.products) {
      if (products.length >= MAX_PRODUCTS) break;
      const productUrl = `${base}/products/${product.handle}`;
      const mainImage  = product.images?.[0]?.src || '';
      const variants   = Array.isArray(product.variants) ? product.variants : [];

      if (variants.length === 0) {
        const key = `${product.id}-0`;
        if (!seen.has(key)) { seen.add(key); products.push(buildRow(product, null, productUrl, mainImage, base)); }
      } else {
        for (const variant of variants) {
          if (products.length >= MAX_PRODUCTS) break;
          const key = `${product.id}-${variant.id}`;
          if (!seen.has(key)) { seen.add(key); products.push(buildRow(product, variant, productUrl, mainImage, base)); }
        }
      }
    }

    if (products.length === 0) {
      reasons.push(`${endpoint} → expanded to 0 variant rows`);
      continue;
    }

    return {
      success:      true,
      platform:     'shopify',
      scrapeMethod: 'Shopify JSON',
      products,
      total:        data.products.length,
      endpoint,
    };
  }

  return { success: false, reason: reasons.join(' | ') || 'No Shopify endpoints succeeded' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRow(product, variant, productUrl, mainImage, base) {
  const isDefault = !variant || variant.title === 'Default Title';
  const imageUrl  = variant?.featured_image?.src || mainImage || '';

  return {
    upc:          variant?.barcode || '',
    price:        variant?.price   || '',
    description:  isDefault
      ? (product.title || '')
      : `${product.title || ''} - ${variant.title || ''}`,
    brand:        product.vendor || '',
    sku:          variant?.sku || '',
    productUrl,
    imageUrl,
    category:     product.product_type || '',
    variant:      isDefault ? '' : (variant?.title || ''),
    availability: variant?.available != null
      ? (variant.available ? 'In Stock' : 'Out of Stock')
      : 'Unknown',
    sourceWebsite: base,
    scrapeMethod:  'Shopify JSON',
  };
}

function extractCollectionHandle(collectionUrl) {
  try {
    const normalized = normalizeUrl(collectionUrl) || collectionUrl;
    const url = new URL(normalized);
    const match = url.pathname.match(/\/collections\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
