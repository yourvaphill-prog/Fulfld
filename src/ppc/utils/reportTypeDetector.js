const TYPE_SIGNALS = {
  searchTerm: [
    'Customer Search Term',
    'Search Term',
  ],
  product: [
    'Advertised ASIN',
    'Advertised SKU',
  ],
  campaign: [
    'Campaign Name',
    'Campaign',
  ],
};

/**
 * Returns 'searchTerm' | 'product' | 'campaign' | 'unknown'.
 * Checks column headers from the first parsed row.
 */
export function detectReportType(headers) {
  const headerSet = new Set(headers.map(h => h.trim()));

  if (TYPE_SIGNALS.searchTerm.some(s => headerSet.has(s))) return 'searchTerm';
  if (TYPE_SIGNALS.product.some(s => headerSet.has(s))) return 'product';
  if (TYPE_SIGNALS.campaign.some(s => headerSet.has(s))) return 'campaign';

  return 'unknown';
}

export const REPORT_TYPE_LABELS = {
  campaign: 'Campaign Report',
  searchTerm: 'Search Term Report',
  product: 'Advertised Product Report',
  unknown: 'Unknown',
};
