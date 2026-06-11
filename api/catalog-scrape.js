/**
 * Vercel serverless function — Universal Website Catalog Scraper.
 *
 * POST /api/catalog-scrape  { url, brandName?, collectionUrl? }
 *
 * Tier 1:  Shopify JSON endpoints
 * Tier 2:  WooCommerce / WordPress REST API
 * Tier 3a: Sitemap + homepage link discovery → product page scraping
 * Tier 3b: Category/listing page scraping for product card grids
 * Tier 4:  Generic HTML on submitted URL (JSON-LD / gated OG / product cards)
 * Tier 5:  Fallback error
 *
 * Every response includes a `diagnostics` object with per-tier detail counts.
 * UPCs are NEVER invented — blank when not found.
 */

import { getBaseUrl }              from '../lib/catalog/urlUtils.js';
import { fetchShopify }            from '../lib/catalog/shopifyFetcher.js';
import { fetchWooCommerce }        from '../lib/catalog/wooCommerceFetcher.js';
import { discoverUrls }            from '../lib/catalog/sitemapDiscoverer.js';
import {
  scrapeProductPages,
  scrapeListingPages,
  scrapeGenericPage,
}                                  from '../lib/catalog/htmlPageScraper.js';
import { normalizeRow, COLUMNS }   from '../lib/catalog/productNormalizer.js';

// ── CORS helper ───────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://fufldcc.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

function setCorsHeaders(res, reqOrigin) {
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Vary',                         'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

export default async function handler(req, res) {
  setCorsHeaders(res, req.headers.origin || '');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth check ────────────────────────────────────────────────────────────
  const expectedKey = process.env.FULFLD_INTERNAL_API_KEY;
  if (!expectedKey) {
    return res.status(500).json({ error: 'FULFLD_INTERNAL_API_KEY is not configured. Add it in Vercel → Settings → Environment Variables.' });
  }
  const incomingKey = req.headers['x-api-key'];
  if (!incomingKey || incomingKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
  }

  const {
    url:           userUrl,
    brandName      = '',
    collectionUrl  = '',
    mode           = 'fast',
    manualUrls     = [],
  } = req.body || {};

  // ── Manual URLs mode ─────────────────────────────────────────────────────────
  if (mode === 'manual') {
    // Accept either an array (from JSON) or a newline-delimited string
    const rawList = Array.isArray(manualUrls) ? manualUrls : String(manualUrls).split(/\n|,/);
    const urls = rawList
      .map(u => (typeof u === 'string' ? u.trim() : ''))
      .filter(u => u.length > 4 && /^https?:\/\//i.test(u))
      .slice(0, 50);

    if (urls.length === 0) {
      return res.status(400).json({ error: 'No valid URLs provided. Each URL must start with http:// or https://' });
    }

    const allProducts = [];
    const failedUrls  = [];

    for (const url of urls) {
      const base    = getBaseUrl(url) || url;
      const result  = await scrapeGenericPage(url, base);

      if (result.success && result.products.length > 0) {
        for (const p of result.products) {
          allProducts.push(
            normalizeRow(p, {
              brandName:    brandName.trim(),
              sourceWebsite: base,
              scrapeMethod:  'Manual URL',
            })
          );
        }
      } else {
        failedUrls.push(url);
      }
    }

    // De-duplicate by Product URL or description
    const seen   = new Set();
    const unique = allProducts.filter(r => {
      const key = r['Product URL'] || r['Product Description'];
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const warnings = [];
    if (failedUrls.length > 0) {
      warnings.push(
        `${failedUrls.length} of ${urls.length} URL${urls.length !== 1 ? 's' : ''} returned no product data` +
        (failedUrls.length <= 3 ? `: ${failedUrls.join(', ')}` : '')
      );
    }

    const diagnostics = {
      manual_urls_submitted: urls.length,
      manual_urls_scraped:   urls.length - failedUrls.length,
      manual_failed:         failedUrls.length,
      manual_failed_urls:    failedUrls,
    };

    if (unique.length === 0) {
      return res.status(200).json({
        platform:     'manual',
        scrapeMethod: 'Manual URL',
        products:     [],
        total:        0,
        columns:      COLUMNS,
        warnings,
        diagnostics,
        error: 'No product data found in the provided URLs. The pages may require JavaScript rendering, have no detectable product signals, or block scraping.',
      });
    }

    return res.status(200).json(
      buildSuccess('manual', 'Manual URL', unique, warnings, COLUMNS, diagnostics)
    );
  }

  // ── Fast scrape (default) — validate URL ─────────────────────────────────────
  if (!userUrl || typeof userUrl !== 'string' || userUrl.trim().length < 4) {
    return res.status(400).json({ error: 'Missing or invalid field: url' });
  }

  const base = getBaseUrl(userUrl);
  if (!base) {
    return res.status(400).json({ error: 'Could not parse URL. Include the full address, e.g. https://brand.com' });
  }

  const defaults   = { brandName: brandName.trim(), sourceWebsite: base };
  const warnings   = [];
  const diagnostics = {
    t1_shopify:        'not tried',
    t2_woocommerce:    'not tried',
    t3_sitemap:        'not tried',
    t3_homepage_links: 'not tried',
    t3_pages_scraped:  0,
    t3_products_found: 0,
    t3c_listing_pages: 0,
    t3c_products_found: 0,
    t4_generic:        'not tried',
  };

  // ── Tier 1: Shopify ─────────────────────────────────────────────────────────
  const t1 = await fetchShopify(userUrl, collectionUrl || null);
  diagnostics.t1_shopify = t1.success
    ? `✓ ${t1.products.length} products via ${t1.endpoint}`
    : `✗ ${t1.reason}`;

  if (t1.success) {
    const rows = t1.products.map(p => normalizeRow(p, { ...defaults, scrapeMethod: 'Shopify JSON' }));
    return res.status(200).json(buildSuccess('shopify', 'Shopify JSON', rows, [], COLUMNS, diagnostics));
  }
  warnings.push(`Tier 1 (Shopify): ${t1.reason}`);

  // ── Tier 2: WooCommerce / WordPress ─────────────────────────────────────────
  const t2 = await fetchWooCommerce(userUrl);
  diagnostics.t2_woocommerce = t2.success
    ? `✓ ${t2.products.length} products (${t2.platform})`
    : `✗ ${t2.reason}`;

  if (t2.success) {
    const rows = t2.products.map(p => normalizeRow(p, { ...defaults, scrapeMethod: 'WooCommerce API' }));
    return res.status(200).json(buildSuccess(t2.platform, 'WooCommerce API', rows, [], COLUMNS, diagnostics));
  }
  warnings.push(`Tier 2 (WooCommerce): ${t2.reason}`);

  // ── Tier 3: Discovery + per-page scraping ────────────────────────────────────
  const discovery = await discoverUrls(userUrl);

  diagnostics.t3_sitemap = discovery.sitemapFound
    ? `✓ Found sitemap — ${discovery.sitemapProductCount} product URLs`
    : '✗ No sitemap found';
  diagnostics.t3_homepage_links = discovery.homepageLinksFound > 0
    ? `✓ ${discovery.homepageLinksFound} product/category links from homepage`
    : '✗ No product/category links found on homepage';

  // Tier 3a: Scrape individual product pages
  if (discovery.productUrls.length > 0) {
    const pageProducts = await scrapeProductPages(discovery.productUrls, base);
    diagnostics.t3_pages_scraped  = discovery.productUrls.length;
    diagnostics.t3_products_found = pageProducts.length;

    if (pageProducts.length > 0) {
      const rows = pageProducts.map(p => normalizeRow(p, { ...defaults, scrapeMethod: 'Sitemap + HTML' }));
      return res.status(200).json(
        buildSuccess('generic', 'Sitemap + HTML', rows,
          [`${discovery.productUrls.length} URLs discovered · ${pageProducts.length} products extracted`],
          COLUMNS, diagnostics)
      );
    }
    warnings.push(`Tier 3a (product pages): scraped ${discovery.productUrls.length} pages, 0 products extracted`);
  } else {
    diagnostics.t3_pages_scraped = 0;
    warnings.push('Tier 3 (discovery): no direct product URLs found');
  }

  // Tier 3b: Scrape category/listing pages for product card grids
  if (discovery.categoryUrls.length > 0) {
    const listingProducts = await scrapeListingPages(discovery.categoryUrls, base);
    diagnostics.t3c_listing_pages  = discovery.categoryUrls.length;
    diagnostics.t3c_products_found = listingProducts.length;

    if (listingProducts.length > 0) {
      // De-duplicate by productUrl
      const seen = new Set();
      const unique = listingProducts.filter(p => {
        if (seen.has(p.productUrl)) return false;
        seen.add(p.productUrl);
        return true;
      });
      const rows = unique.map(p => normalizeRow(p, { ...defaults, scrapeMethod: 'Sitemap + HTML' }));
      return res.status(200).json(
        buildSuccess('generic', 'Sitemap + HTML', rows,
          [`${discovery.categoryUrls.length} category pages scraped · ${unique.length} product cards extracted`],
          COLUMNS, diagnostics)
      );
    }
    warnings.push(`Tier 3b (listing pages): scraped ${discovery.categoryUrls.length} category pages, 0 product cards extracted`);
  } else {
    diagnostics.t3c_listing_pages = 0;
    warnings.push('Tier 3b (listing pages): no category/listing URLs found');
  }

  // ── Tier 4: Generic HTML on submitted URL ─────────────────────────────────
  const t4 = await scrapeGenericPage(userUrl, base);
  diagnostics.t4_generic = t4.success
    ? `✓ ${t4.products.length} products extracted`
    : `✗ ${t4.reason}`;

  if (t4.success && t4.products.length > 0) {
    const rows = t4.products.map(p => normalizeRow(p, { ...defaults, scrapeMethod: 'Generic HTML' }));
    return res.status(200).json(
      buildSuccess('generic', 'Generic HTML', rows,
        ['Generic HTML extraction — review data carefully before exporting.'],
        COLUMNS, diagnostics)
    );
  }
  warnings.push(`Tier 4 (Generic HTML): ${t4.reason || 'no products found'}`);

  // ── Tier 5: Fallback ──────────────────────────────────────────────────────
  return res.status(200).json({
    platform:     'unknown',
    scrapeMethod: 'failed',
    products:     [],
    total:        0,
    columns:      COLUMNS,
    warnings,
    diagnostics,
    error: 'Could not extract product catalog. This site may block scraping, require JavaScript rendering, or require a login. Try a different URL or export the catalog manually.',
  });
}

function buildSuccess(platform, scrapeMethod, rows, warnings, columns, diagnostics) {
  return {
    platform,
    scrapeMethod,
    products: rows,
    total:    rows.length,
    columns,
    warnings,
    diagnostics,
    error:    null,
  };
}
