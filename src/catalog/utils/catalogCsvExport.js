/**
 * Catalog CSV export utility.
 * Produces a UPC Scanner-compatible CSV file and triggers a browser download.
 */

export const CATALOG_COLUMNS = [
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
 * Export rows as a CSV file and download it in the browser.
 * @param {object[]} rows   - Array of product row objects (matching CATALOG_COLUMNS keys).
 * @param {string}   brandName - Used to build the filename.
 * @returns {string} The filename that was downloaded.
 */
export function exportCatalogCSV(rows, brandName = 'catalog') {
  if (!rows || rows.length === 0) return '';

  // Sanitize brand name for use in filename
  const safeName = (brandName || 'catalog').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'catalog';
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_catalog_${date}.csv`;

  const csvLines = [
    // Header row
    CATALOG_COLUMNS.join(','),
    // Data rows
    ...rows.map(row =>
      CATALOG_COLUMNS
        .map(col => {
          const val = row[col] ?? '';
          // JSON.stringify adds quotes and escapes internal quotes — safe for CSV
          return JSON.stringify(String(val));
        })
        .join(',')
    ),
  ];

  const csv  = csvLines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}
