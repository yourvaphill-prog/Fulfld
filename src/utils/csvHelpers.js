const cleanStr = (s) => (s || '').toLowerCase().replace(/^﻿/, '').replace(/['"]/g, '').trim();

export function detectType(headers) {
  const h = headers.map(cleanStr);
  if (h.some(x => x.includes('brand name')) && h.some(x => x.includes('brand score'))) return 'brands';
  if (h.some(x => x.includes('search term')) && h.some(x => x.includes('opportunity score'))) return 'search_terms';
  if (h.some(x => x.includes('seller id'))) return 'sellers';
  if (h.some(x => x === 'asin') && h.some(x => x.includes('page score'))) return 'products';
  if (h.some(x => x.includes('total ad spend'))) return 'adspy';
  if (h.some(x => x.includes('node id'))) return 'subcategories';
  return 'unknown';
}

export function normalizeSubcat(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildSubcatNodeMap(subcatData) {
  const map = new Map();
  for (const row of (subcatData || [])) {
    const rev = Number(row['Estimated Monthly Revenue']);
    if (isNaN(rev) || rev <= 0) continue;
    for (let i = 1; i <= 12; i++) {
      const name = normalizeSubcat(row[`Level ${i}`] || '');
      if (name && !map.has(name)) map.set(name, row);
    }
  }
  return map;
}

export function buildBrandSubcatMaps(productsData) {
  const revenueMap    = new Map();
  const countMap      = new Map();
  const totalCountMap = new Map();
  for (const p of (productsData || [])) {
    const brand  = (p['Brand'] || '').toLowerCase().trim();
    const subcat = normalizeSubcat(p['Primary Subcategory Name'] || p['Primary Subcategory'] || '');
    if (!brand || !subcat) continue;
    const key = `${brand}::${subcat}`;
    const rev = Number(p['Est. Monthly Revenue']) || 0;
    if (rev > 0) revenueMap.set(key, (revenueMap.get(key) || 0) + rev);
    countMap.set(key, (countMap.get(key) || 0) + 1);
    totalCountMap.set(brand, (totalCountMap.get(brand) || 0) + 1);
  }
  return { revenueMap, countMap, totalCountMap };
}

export function getBrandSubcatRevenue(brandKey, subcatKey, brandTotalRevenue, maps) {
  const key    = `${brandKey}::${subcatKey}`;
  const direct = maps.revenueMap.get(key);
  if (direct != null) return direct;
  const subcatCount = maps.countMap.get(key) ?? 0;
  const totalCount  = maps.totalCountMap.get(brandKey) ?? 0;
  if (subcatCount > 0 && totalCount > 0 && brandTotalRevenue > 0) {
    return brandTotalRevenue * (subcatCount / totalCount);
  }
  return null;
}

export function buildAdspyMap(adspyData) {
  const map = new Map();
  for (const row of (adspyData || [])) {
    const name = (row['Brand'] || '').toLowerCase().trim();
    if (name && !map.has(name)) map.set(name, row);
  }
  return map;
}

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmt = (n, prefix = '', suffix = '') => {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
  const num = Number(n);
  if (Math.abs(num) >= 1_000_000) return `${prefix}${(num / 1_000_000).toFixed(1)}M${suffix}`;
  if (Math.abs(num) >= 1_000)     return `${prefix}${(num / 1_000).toFixed(1)}K${suffix}`;
  return `${prefix}${num.toFixed(2)}${suffix}`;
};
export const pct   = (n) => (n === null || n === undefined || n === '' ? '—' : `${(Number(n) * 100).toFixed(1)}%`);
export const money = (n) => fmt(n, '$');
