/**
 * upcCache.js — Supabase cache helpers for UPC Scanner
 *
 * Handles:
 *  - Reading cached Amazon/Keepa product data by UPC
 *  - Writing fresh Keepa results to the cache
 *  - Saving scan sessions (one per uploaded file scan)
 *  - Saving row-level scan results
 *  - Loading saved scan session history
 *  - Deleting saved scan sessions (cascades to results)
 *
 * IMPORTANT:
 *  - Never stores Keepa API key
 *  - Never stores supplier cost, profit, ROI, margin, or decision
 *    (those are always recalculated from the current upload)
 *  - Only stores Amazon/Keepa product data that doesn't change per supplier
 */

import { supabase, hasSupabase } from '../lib/supabase.js';

const MARKETPLACE = 'US';

// ── Cache age helpers ─────────────────────────────────────────────────────────
export function cacheAgeDays(lastScannedAt) {
  if (!lastScannedAt) return Infinity;
  return (Date.now() - new Date(lastScannedAt).getTime()) / (1000 * 60 * 60 * 24);
}

export function cacheAgeLabel(lastScannedAt) {
  const days = cacheAgeDays(lastScannedAt);
  if (days <= 7)  return 'Fresh';
  if (days <= 30) return 'Older';
  return 'Old';
}

// ── Read: check cache for a batch of UPCs ────────────────────────────────────
// Returns a map: { [normalizedUPC]: cacheRow | null }
export async function checkCacheBatch(normalizedUPCs) {
  if (!hasSupabase || !normalizedUPCs.length) return {};

  const { data, error } = await supabase
    .from('upc_product_cache')
    .select('*')
    .in('normalized_upc', normalizedUPCs)
    .eq('marketplace', MARKETPLACE);

  if (error) {
    console.warn('[upcCache] checkCacheBatch error:', error.message, '— treating all as cache miss');
    return {};
  }

  const map = {};
  for (const row of data || []) {
    map[row.normalized_upc] = row;
  }
  console.log(`[upcCache] checkCacheBatch: ${normalizedUPCs.length} queried, ${Object.keys(map).length} hits`);
  return map;
}

// ── Write: upsert a single UPC result into the cache ─────────────────────────
// Call this after ANY fresh Keepa scan result — including No Match, Possible
// Match, and barcode_mismatch rows — so all scanned UPCs are cached and won't
// hit Keepa again on the next scan.
export async function writeCacheEntry(resultRow) {
  if (!hasSupabase) return;
  if (!resultRow?.upc) return;

  const entry = {
    normalized_upc:    resultRow.upc,
    marketplace:       MARKETPLACE,
    asin:              resultRow.asin             ?? null,
    amazon_title:      resultRow.title            ?? null,
    amazon_brand:      resultRow.brand            ?? null,
    category:          resultRow.category         ?? null,
    image_url:         resultRow.imgUrl           ?? null,
    amazon_url:        resultRow.amazonUrl        ?? null,
    buy_box:           resultRow.buyBox           ?? null,
    calc_price:        resultRow.calcPrice        ?? null,
    price_source:      resultRow.calcPriceLabel   ?? null,
    fba_fee:           resultRow.fbaFee           ?? null,
    bsr:               resultRow.bsr              ?? null,
    bsr_label:         resultRow.bsrLabel         ?? null,
    sellers:           resultRow.sellers          ?? null,
    amazon_in_stock:   resultRow.amzInStock       ?? null,
    package_weight:    resultRow.pkgWeight        ?? null,
    pkg_dims:          resultRow.pkgDims          ?? null,
    match_type:        resultRow.matchType        ?? null,
    validation_status: resultRow.scanValidation   ?? null,
    scan_notes:        resultRow.notes            ?? null,
    last_scanned_at:   new Date().toISOString(),
  };

  const { error } = await supabase
    .from('upc_product_cache')
    .upsert(entry, { onConflict: 'normalized_upc,marketplace' });

  if (error) {
    console.warn('[upcCache] writeCacheEntry error:', error.message, '| UPC:', resultRow.upc);
  } else {
    console.log(`[upcCache] ✓ cached UPC=${resultRow.upc} match_type=${entry.match_type} asin=${entry.asin ?? 'none'}`);
  }
}

// ── Convert a cache row → the shape expected by buildResult in UPCScanner ────
// Maps Supabase column names back to the field names UPCScanner uses internally.
export function cacheRowToKeepaData(row) {
  if (!row) return null;
  return {
    asin:           row.asin,
    title:          row.amazon_title,
    brand:          row.amazon_brand,
    category:       row.category,
    imgUrl:         row.image_url,
    amazonUrl:      row.amazon_url,
    buyBox:         row.buy_box         != null ? Number(row.buy_box)   : null,
    calcPrice:      row.calc_price      != null ? Number(row.calc_price): null,
    calcPriceLabel: row.price_source    ?? 'Missing',
    sellingPrice:   row.calc_price      != null ? Number(row.calc_price): null,
    priceSource:    row.price_source    ?? 'Missing',
    fbaFee:         row.fba_fee         != null ? Number(row.fba_fee)   : null,
    bsr:            row.bsr             != null ? Number(row.bsr)       : null,
    bsrLabel:       row.bsr_label       ?? null,
    bsr90:          null,
    sellers:        row.sellers         != null ? Number(row.sellers)   : null,
    amzInStock:     row.amazon_in_stock ?? false,
    pkgWeight:      row.package_weight  ?? null,
    pkgDims:        row.pkg_dims        ?? null,
    // These are set on the result row level, not from cache:
    newPrice:       null,
    amzPrice:       null,
    buyBox90:       null,
  };
}

// ── Save scan session (one per uploaded-file scan) ────────────────────────────
// Returns the new session id (uuid string) or null on failure.
export async function saveScanSession({ brandName, sourceFileName, summary, missingUPCCount, userName }) {
  if (!hasSupabase) return null;

  const { data, error } = await supabase
    .from('upc_scan_sessions')
    .insert({
      brand_name:               brandName,
      source_file_name:         sourceFileName || null,
      total_products:           summary.total           ?? 0,
      upcs_available_supplier:  summary.total           ?? 0,
      upcs_missing_supplier:    missingUPCCount         ?? 0,
      asins_found:              summary.matched         ?? 0,
      profitable_asins:         summary.good            ?? 0,
      non_profitable_asins:     (summary.maybe ?? 0) + (summary.pass ?? 0),
      upc_not_available_amazon: summary.noMatch         ?? 0,
      possible_matches:         summary.possibleMatch   ?? 0,
      created_by:               userName                || null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[upcCache] saveScanSession error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

// ── Save row-level scan results ───────────────────────────────────────────────
// reviewMaps: { rowStatus, rowNotes, rowPRMember, rowFbaFbm, rowSupplierLink, settings }
export async function saveScanResults(sessionId, results, packCounts, reviewMaps = {}) {
  if (!hasSupabase || !sessionId || !results.length) return;

  const { rowStatus = {}, rowNotes = {}, rowPRMember = {}, rowFbaFbm = {},
          rowSupplierLink = {}, settings = {} } = reviewMaps;

  const rows = results.map(r => {
    const pc        = packCounts?.[r.upc] ?? 1;
    const totalCost = r.price != null ? r.price * pc : null;
    const awlPct    = settings.awlPct ?? 10;
    const awlAmt    = r.calcPrice != null ? r.calcPrice * (awlPct / 100) : null;
    return {
      scan_session_id:       sessionId,
      normalized_upc:        r.upc        || null,
      supplier_description:  r.desc       || null,
      supplier_unit_price:   r.price      ?? null,
      pack_count:            pc,
      total_supplier_cost:   totalCost,
      asin:                  r.asin       || null,
      amazon_title:          r.title      || null,
      buy_box:               r.buyBox     ?? null,
      bsr:                   r.bsr        ?? null,
      decision:              r.decision   || null,
      estimated_profit:      r.pc?.profit ?? null,
      roi:                   r.pc?.roi    ?? null,
      margin:                r.pc?.margin ?? null,
      match_type:            r.matchType  || null,
      cache_status:          r.cacheStatus || 'fresh_scan',
      last_keepa_scan_date:  r.lastKeepaScannedAt || new Date().toISOString(),
      notes:                 r.notes      || null,
      // Brand Insider review fields (new columns)
      brand_insider_status:  rowStatus[r.upc]       || null,
      brand_insider_notes:   rowNotes[r.upc]        || null,
      pr_member:             rowPRMember[r.upc]     || null,
      fba_fbm:               rowFbaFbm[r.upc]       || null,
      supplier_link_or_code: rowSupplierLink[r.upc] || r.upc || null,
      awl_fee_percent:       awlPct,
      awl_fee_amount:        awlAmt,
    };
  });

  // Insert in chunks of 100 to stay within Supabase limits
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from('upc_scan_results').insert(chunk);
    if (error) console.warn('[upcCache] saveScanResults chunk error:', error.message);
  }
}

// ── Load saved scan session history ──────────────────────────────────────────
// Returns array of sessions, newest first, with row-count included.
export async function loadScanSessions() {
  if (!hasSupabase) return [];

  const { data, error } = await supabase
    .from('upc_scan_sessions')
    .select('*')
    .order('scan_date', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[upcCache] loadScanSessions error:', error.message);
    return [];
  }
  return data || [];
}

// ── Load results for a specific saved session ─────────────────────────────────
export async function loadSessionResults(sessionId) {
  if (!hasSupabase || !sessionId) return [];

  const { data, error } = await supabase
    .from('upc_scan_results')
    .select('*')
    .eq('scan_session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[upcCache] loadSessionResults error:', error.message);
    return [];
  }
  return data || [];
}

// ── Load session results + matching cache rows, merged ────────────────────────
// Returns { savedRows, cacheByUpc } where:
//   savedRows   = upc_scan_results rows for this session
//   cacheByUpc  = { [normalizedUpc]: upc_product_cache row }
// The caller is responsible for merging them into ASIN Review result objects.
export async function loadSessionWithCache(sessionId) {
  if (!hasSupabase || !sessionId) return { savedRows: [], cacheByUpc: {} };

  // 1. Load saved result rows
  const { data: savedRows, error: e1 } = await supabase
    .from('upc_scan_results')
    .select('*')
    .eq('scan_session_id', sessionId)
    .order('created_at', { ascending: true });

  if (e1) {
    console.warn('[upcCache] loadSessionWithCache results error:', e1.message);
    return { savedRows: [], cacheByUpc: {} };
  }

  const rows = savedRows || [];

  // 2. Collect UPCs that have a value
  const upcs = [...new Set(rows.map(r => r.normalized_upc).filter(Boolean))];

  // 3. Fetch matching cache entries
  let cacheByUpc = {};
  if (upcs.length) {
    const { data: cacheRows, error: e2 } = await supabase
      .from('upc_product_cache')
      .select('*')
      .in('normalized_upc', upcs)
      .eq('marketplace', 'US');

    if (!e2 && cacheRows) {
      for (const c of cacheRows) cacheByUpc[c.normalized_upc] = c;
    }
  }

  return { savedRows: rows, cacheByUpc };
}

// ── Delete a saved scan session (cascades to upc_scan_results) ───────────────
export async function deleteScanSession(sessionId) {
  if (!hasSupabase || !sessionId) return false;

  const { error } = await supabase
    .from('upc_scan_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.warn('[upcCache] deleteScanSession error:', error.message);
    return false;
  }
  return true;
}
