const COLUMN_MAP = {
  // Campaign & ad group
  'Campaign Name': 'campaignName',
  'Campaign': 'campaignName',
  'Ad Group Name': 'adGroupName',
  'Ad Group': 'adGroupName',
  // Search term
  'Customer Search Term': 'searchTerm',
  'Search Term': 'searchTerm',
  // Identifiers
  'Advertised SKU': 'sku',
  'SKU': 'sku',
  'Advertised ASIN': 'asin',
  'ASIN': 'asin',
  'Match Type': 'matchType',
  'Targeting': 'targeting',
  'Keyword': 'targeting',
  // Product title (present in some Advertised Product / Search Term exports)
  'Product Title': 'productTitle',
  'Advertised Product Title': 'productTitle',
  'Title': 'productTitle',
  'Product Name': 'productTitle',
  // Spend & sales
  'Spend': 'spend',
  'Cost': 'spend',
  '7 Day Total Sales': 'sales',
  '7 Day Total Sales ($)': 'sales',
  'Sales': 'sales',
  'Total Sales': 'sales',
  '7 Day Total Orders (#)': 'orders',
  '7 Day Total Orders': 'orders',
  'Orders': 'orders',
  'Total Orders': 'orders',
  'Units Ordered': 'orders',
  '7 Day Advertised SKU Units (#)': 'units',
  // Traffic
  'Impressions': 'impressions',
  'Clicks': 'clicks',
  // Pre-calculated metrics (may already exist)
  'Click-Thru Rate (CTR)': 'ctr',
  'Click Through Rate': 'ctr',
  'CTR': 'ctr',
  'Cost Per Click (CPC)': 'cpc',
  'CPC': 'cpc',
  'Total Advertising Cost of Sales (ACOS)': 'acos',
  'Advertising Cost of Sales (ACOS)': 'acos',
  'ACOS': 'acos',
  'ACoS': 'acos',
  'Return on Advertising Spend (ROAS)': 'roas',
  'ROAS': 'roas',
  // Date
  'Start Date': 'startDate',
  'End Date': 'endDate',
  'Date': 'date',
  // Portfolio & status
  'Portfolio Name': 'portfolioName',
  'Campaign Status': 'campaignStatus',
  'Currency': 'currency',
};

function parseNum(val) {
  if (val == null || val === '' || val === '--' || val === 'N/A') return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[$,%]/g, '')) || 0;
}

export function normalizeRow(rawRow) {
  const normalized = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const trimmed = rawKey.trim();
    const mappedKey = COLUMN_MAP[trimmed] || toCamelCase(trimmed);
    normalized[mappedKey] = value;
  }

  // Coerce numeric fields
  const numericFields = [
    'impressions', 'clicks', 'spend', 'sales', 'orders', 'units',
    'ctr', 'cpc', 'acos', 'roas',
  ];
  for (const field of numericFields) {
    if (normalized[field] !== undefined) {
      normalized[field] = parseNum(normalized[field]);
    }
  }

  // CTR/ACOS from Amazon are sometimes percentages (e.g. "2.5%") — keep as decimal
  if (normalized.ctr > 1) normalized.ctr = normalized.ctr / 100;
  if (normalized.acos > 1) normalized.acos = normalized.acos / 100;

  return normalized;
}

export function normalizeRows(rows) {
  return rows.map(normalizeRow);
}

function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export { COLUMN_MAP };
