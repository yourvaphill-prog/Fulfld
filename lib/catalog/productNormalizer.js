/**
 * Normalizes raw product data from any scraping tier
 * into the 13-column UPC Scanner-compatible row format.
 *
 * Rule: Never invent a UPC. If the source has no barcode/gtin/upc,
 * the UPC column is left blank ('').
 */

export const COLUMNS = [
  'UPC',
  'Price',
  'Product Description',
  'Brand Name',
  'Supplier Link / Item Code',
  'Product URL',
  'Image URL',
  'Category',
  'Variant / Shade',
  'SKU',
  'Availability',
  'Source Website',
  'Scrape Method',
];

/**
 * Normalize a raw intermediate product object into a UPC Scanner-ready row.
 * @param {object} raw - Raw product data from any tier fetcher.
 * @param {object} defaults - { brandName, sourceWebsite, scrapeMethod }
 * @returns {object} A flat row matching COLUMNS exactly.
 */
export function normalizeRow(raw, defaults = {}) {
  const rawUpc = clean(
    raw.upc || raw.barcode || raw.gtin || raw.gtin14 ||
    raw.gtin13 || raw.gtin12 || raw.gtin8 || ''
  );

  // UPC must be all digits, 8–14 characters — otherwise leave blank
  const validUpc = /^\d{8,14}$/.test(rawUpc) ? rawUpc : '';

  const sku        = clean(raw.sku || '');
  const productUrl = clean(raw.productUrl || raw.product_url || raw.url || '');

  return {
    'UPC':                        validUpc,
    'Price':                      clean(raw.price || ''),
    'Product Description':        clean(raw.description || raw.title || raw.name || ''),
    'Brand Name':                 clean(defaults.brandName || raw.brand || raw.vendor || ''),
    'Supplier Link / Item Code':  sku || productUrl,
    'Product URL':                productUrl,
    'Image URL':                  clean(raw.imageUrl || raw.image_url || raw.image || ''),
    'Category':                   clean(raw.category || raw.product_type || raw.collection || ''),
    'Variant / Shade':            clean(raw.variant || raw.shade || raw.option || ''),
    'SKU':                        sku,
    'Availability':               normalizeAvailability(raw.availability ?? raw.available),
    'Source Website':             clean(defaults.sourceWebsite || raw.sourceWebsite || ''),
    'Scrape Method':              clean(defaults.scrapeMethod || raw.scrapeMethod || ''),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normalizeAvailability(val) {
  if (val === null || val === undefined) return 'Unknown';
  if (typeof val === 'boolean') return val ? 'In Stock' : 'Out of Stock';
  const s = String(val).toLowerCase();
  if (s === 'in stock' || s === 'instock' || s === 'true' || s === '1') return 'In Stock';
  if (s === 'out of stock' || s === 'outofstock' || s === 'false' || s === '0') return 'Out of Stock';
  if (s === 'unknown' || s === '') return 'Unknown';
  return clean(val);
}
