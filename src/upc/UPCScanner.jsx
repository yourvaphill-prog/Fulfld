import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import {
  Upload, Download, Search, AlertCircle, CheckCircle,
  X, ChevronUp, ChevronDown, Settings, ExternalLink,
  AlertTriangle, Filter, Copy, BarChart2, Clock, RefreshCw, Trash2, History,
  FolderOpen, ArrowLeft,
} from 'lucide-react';
import {
  checkCacheBatch, writeCacheEntry, cacheRowToKeepaData,
  saveScanSession, saveScanResults, loadScanSessions, loadSessionResults,
  loadSessionWithCache, deleteScanSession, cacheAgeDays, cacheAgeLabel,
} from './upcCache.js';
import { hasSupabase } from '../lib/supabase.js';
import * as XLSX from 'xlsx';

// ── Design tokens (orange accent, matching web app dark theme) ────────────────
const ORANGE = '#f59e0b';
const G      = '#00ff87';
const B      = '#3b82f6';
const RED    = '#ef476f';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';
const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Shared style helpers ──────────────────────────────────────────────────────
const btn = (variant = 'default') => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8,
  padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: FONT,
  whiteSpace: 'nowrap', border: '1px solid', transition: 'all 0.15s',
  ...(variant === 'orange' ? { background: `${ORANGE}15`, borderColor: `${ORANGE}45`, color: ORANGE }
    : variant === 'green'  ? { background: `${G}15`, borderColor: `${G}45`, color: G }
    : variant === 'blue'   ? { background: `${B}15`, borderColor: `${B}45`, color: B }
    : variant === 'red'    ? { background: `${RED}15`, borderColor: `${RED}45`, color: RED }
    : variant === 'active' ? { background: `${ORANGE}20`, borderColor: ORANGE, color: ORANGE }
    : { background: 'rgba(255,255,255,0.04)', borderColor: BORDER, color: '#64748b' }),
});

const inputBare = {
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: '8px 12px', color: '#e2e8f0', fontFamily: FONT, fontSize: 12,
  outline: 'none', boxSizing: 'border-box',
};

// ── Column name aliases for auto-detection ───────────────────────────────────
const UPC_ALIASES   = ['upc','upc code','barcode','product upc','item upc','universal product code','ean','gtin'];
const PRICE_ALIASES = ['price','unit price','cost','supplier price','wholesale price','unit cost','product cost','your cost','net cost'];
const DESC_ALIASES  = ['product description','description','product name','item description','item name','title','product title','name'];
const BRAND_ALIASES        = ['brand','brand name','manufacturer','vendor','supplier brand'];
const SUPPLIER_LINK_ALIASES = ['supplier link','link','supplier url','item code','sku','supplier sku','product code','item number','supplier item'];

function detectColumns(headers) {
  const norm = h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const find = aliases => {
    const normed = headers.map(norm);
    for (const alias of aliases) {
      const idx = normed.indexOf(alias);
      if (idx !== -1) return headers[idx];
    }
    for (const alias of aliases) {
      const idx = normed.findIndex(h => h.includes(alias));
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  return {
    upc:          find(UPC_ALIASES),
    price:        find(PRICE_ALIASES),
    desc:         find(DESC_ALIASES),
    brand:        find(BRAND_ALIASES),         // optional — Brand Insider grouping
    supplierLink: find(SUPPLIER_LINK_ALIASES), // optional — Supplier Link/SKU/Item Code
  };
}

// ── Value cleaners ────────────────────────────────────────────────────────────
const cleanPrice = v => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
};

const cleanUPC = v => {
  if (!v) return '';
  let s = String(v).trim();
  // Excel sometimes exports numbers as "850687110512.0" — strip the decimal part
  // before removing non-digits, so we don't append the trailing zero to the code.
  if (s.includes('.')) s = s.split('.')[0];
  return s.replace(/[^0-9]/g, '');
};

// ── Pack count detector ───────────────────────────────────────────────────────
// Scans a text string for multi-pack signals and returns the numeric count,
// or null if no pack pattern is found.
// Only returns values between 2 and 144 (sanity-checked).
function detectPackCount(text) {
  if (!text) return null;
  const t = text.toLowerCase();

  // Ordered from most-specific to least-specific so the first match wins
  const patterns = [
    /pack\s+of\s+(\d+)/,           // "Pack of 2", "Pack of 12"
    /count\s+of\s+(\d+)/,          // "Count of 4"
    /set\s+of\s+(\d+)/,            // "Set of 2"
    /bundle\s+of\s+(\d+)/,         // "Bundle of 3"
    /(\d+)\s*-\s*pack/,            // "2-Pack", "12-Pack"
    /(\d+)\s+pack\b/,              // "2 Pack", "3 Pack"
    /\((\d+)\s*pack\)/,            // "(3 pack)"
    /\(pack\s+of\s+(\d+)\)/,       // "(Pack of 2)"
    /(\d+)\s*count\b/,             // "6 Count", "12count"
    /(\d+)\s*-\s*count/,           // "6-Count"
    /(\d+)\s*ct\b/,                // "6ct", "12 ct"
    /(\d+)\s*pk\b/,                // "3pk", "6 pk"
    /(\d+)\s*piece/,               // "3 piece set"
  ];

  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 144) return n;
    }
  }
  return null;
}

// ── Keepa price decoder ───────────────────────────────────────────────────────
// Keepa prices are in cents; -1 = unavailable
const kp = cents => (cents == null || cents < 0 ? null : cents / 100);

function extractKeepaData(product) {
  if (!product) return null;
  const s   = product.stats || {};
  const cur = s.current || [];
  const a90 = s.avg90   || [];

  // ── Price extraction ────────────────────────────────────────────────────────
  // buyBox: ONLY the actual Buy Box price (Keepa type 18). Shown in Buy Box column.
  // Do NOT fall back to other prices in this field — keep it honest.
  const buyBox   = kp(cur[18]);            // actual Buy Box (requires buybox=1 param)
  const newPrice = kp(cur[1]);             // lowest new 3P price
  const amzPrice = kp(cur[0]);             // Amazon-as-seller price
  const buyBox90 = kp(a90[18]);            // 90-day avg Buy Box

  // calcPrice / calcPriceLabel: the price we use for profit math.
  // Waterfall: Buy Box → New Price fallback → Amazon fallback → Missing.
  let calcPrice      = null;
  let calcPriceLabel = 'Missing';          // shown in "Calc Price" / "Src" column

  if (buyBox != null)   { calcPrice = buyBox;    calcPriceLabel = 'Buy Box'; }
  else if (newPrice != null) { calcPrice = newPrice; calcPriceLabel = 'New Price'; }
  else if (amzPrice != null) { calcPrice = amzPrice; calcPriceLabel = 'Amazon';   }

  // ── BSR extraction ─────────────────────────────────────────────────────────
  // Keepa stats arrays are indexed by data type. Type 3 = Sales Rank Reference
  // (the root-category BSR). -1 means unavailable.
  const safeRank = v => (v != null && v > 0) ? v : null;

  const bsrCurrent = safeRank(s.current?.[3]);
  const bsr30avg   = safeRank(s.avg30?.[3]);
  const bsr90avg   = safeRank(s.avg90?.[3]);

  // Fallback: scrape the most recent rank from product.salesRanks for the
  // root/reference category. salesRanks is { categoryId: [ts, rank, ts, rank…] }
  let bsrFromSalesRanks = null;
  if (product.salesRanks && typeof product.salesRanks === 'object') {
    const rootKey  = String(product.salesRankReference ?? product.rootCategory ?? '');
    const rankKeys = Object.keys(product.salesRanks);
    const useKey   = rankKeys.includes(rootKey) ? rootKey : (rankKeys[0] ?? null);
    if (useKey) {
      const rankArr = product.salesRanks[useKey] || [];
      // Array alternates [timestamp, rank, timestamp, rank …]. Last rank value = most recent.
      if (rankArr.length >= 2) {
        const lastVal = rankArr[rankArr.length - 1];
        bsrFromSalesRanks = safeRank(lastVal);
      }
    }
  }

  // Choose best BSR: current → 30-day avg → 90-day avg → salesRanks fallback
  let bsr      = null;
  let bsrLabel = null;
  if      (bsrCurrent        != null) { bsr = bsrCurrent;        bsrLabel = 'Current BSR';    }
  else if (bsr30avg           != null) { bsr = bsr30avg;           bsrLabel = '30-day avg BSR'; }
  else if (bsr90avg           != null) { bsr = bsr90avg;           bsrLabel = '90-day avg BSR'; }
  else if (bsrFromSalesRanks  != null) { bsr = bsrFromSalesRanks;  bsrLabel = 'Category rank';  }

  const bsr90 = bsr90avg; // keep for backward-compat usage elsewhere

  const fbaFee = product.fbaFees?.pickAndPackFee != null
    ? product.fbaFees.pickAndPackFee / 100 : null;

  const imgId  = (product.imagesCSV || '').split(',')[0] || '';
  const imgUrl = imgId ? `https://images-na.ssl-images-amazon.com/images/I/${imgId}.jpg` : null;

  const catTree  = product.categoryTree || [];
  const category = catTree.length ? catTree[catTree.length - 1]?.name : null;

  const sellers    = s.sellerCount   ?? null;
  const amzInStock = product.amazonIsSeller === true;

  const pkgWeight = product.packageWeight != null
    ? `${(product.packageWeight / 1000).toFixed(3)} kg` : null;
  const pkgDims = (product.packageHeight && product.packageLength && product.packageWidth)
    ? `${product.packageLength}×${product.packageWidth}×${product.packageHeight} mm` : null;

  return {
    asin: product.asin,
    title: product.title || null,
    brand: product.brand || null,
    category,
    imgUrl,
    amazonUrl: `https://www.amazon.com/dp/${product.asin}`,
    // Price fields
    buyBox,          // actual Buy Box price (null if no Buy Box)
    newPrice,        // lowest new 3P price (null if unavailable)
    amzPrice,        // Amazon-as-seller price (null if unavailable)
    buyBox90,        // 90-day avg Buy Box
    calcPrice,       // price used for profit calculation
    calcPriceLabel,  // 'Buy Box' | 'New Price' | 'Amazon' | 'Missing'
    // Keep sellingPrice/priceSource aliases for backward compat in calcProfit/classify
    sellingPrice: calcPrice,
    priceSource:  calcPriceLabel,
    bsr, bsr90, bsrLabel,
    fbaFee, sellers, amzInStock,
    pkgWeight, pkgDims,
  };
}

// ── Profit calculation ────────────────────────────────────────────────────────
function calcProfit(sellingPrice, supplierCost, fbaFee, settings) {
  const { prepCost = 0, shipCost = 0, miscBuffer = 0,
          referralPct = 15, fallbackFBA = 0, taxRate = 0, awlPct = 10 } = settings;
  if (sellingPrice == null || supplierCost == null) return null;
  const fba      = fbaFee ?? fallbackFBA;
  const referral = sellingPrice * (referralPct / 100);
  const awlFee   = sellingPrice * (awlPct    / 100);   // ← AWL internal charge
  const tax      = sellingPrice * (taxRate   / 100);
  const profit   = sellingPrice - supplierCost - fba - referral - awlFee - prepCost - shipCost - miscBuffer - tax;
  const roi      = supplierCost > 0 ? (profit / supplierCost) * 100 : null;
  const margin   = sellingPrice > 0 ? (profit / sellingPrice) * 100 : null;
  return { profit, roi, margin, fba, referral, awlFee, fbaSource: fbaFee != null ? 'Keepa' : 'Fallback' };
}

// ── Decision classification ───────────────────────────────────────────────────
function classify(kd, pc, settings) {
  const { minROI = 20, minProfit = 3 } = settings;
  if (!kd?.asin)           return 'NO_MATCH';
  if (!kd.sellingPrice)    return 'MAYBE';
  if (!pc)                 return 'MAYBE';
  const { profit, roi }  = pc;
  if (profit >= minProfit && roi != null && roi >= minROI) return 'GOOD';
  if (profit > 0 || (roi != null && roi > 0))              return 'MAYBE';
  return 'PASS';
}

const PURPLE = '#a78bfa'; // Possible Match accent

const DEC = {
  GOOD:           { label: 'Good Lead',      color: G,       bg: `${G}12`       },
  MAYBE:          { label: 'Maybe',          color: ORANGE,  bg: `${ORANGE}12`  },
  PASS:           { label: 'Pass',           color: RED,     bg: `${RED}12`     },
  POSSIBLE_MATCH: { label: 'Possible Match', color: PURPLE,  bg: `${PURPLE}12`  },
  NO_MATCH:       { label: 'No Match',       color: '#475569', bg: 'rgba(255,255,255,0.04)' },
};
// Sort order in the table when sorted by "decision"
const DEC_ORDER = { GOOD: 0, MAYBE: 1, PASS: 2, POSSIBLE_MATCH: 3, NO_MATCH: 4 };

const DEFAULT_SETTINGS = {
  prepCost: 0, shipCost: 0, miscBuffer: 0,
  referralPct: 15, fallbackFBA: 0, taxRate: 0,
  minROI: 20, minProfit: 3,
  awlPct: 10,   // AWL 10% internal charge on Amazon selling price
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtM   = n => (n == null || isNaN(n) ? '—' : `$${Number(n).toFixed(2)}`);
// BSR shown as comma-separated integer (e.g. 33,053) — NOT abbreviated to K/M
const fmtBSR = n => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));
const fmtP  = n => (n == null || isNaN(n) ? '—' : `${Number(n).toFixed(1)}%`);
const fmtN  = n => {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v/1_000).toFixed(0)}K`;
  return String(v);
};

// ── Small reusable components ─────────────────────────────────────────────────
function Card({ label, value, color, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px', minWidth: 110, backdropFilter: 'blur(8px)', flexShrink: 0 }}>
      <div style={{ fontFamily: FONT, fontSize: 10, color: '#475569', marginBottom: 6, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: color || '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 10, color: '#334155', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function DecBadge({ decision }) {
  const m = DEC[decision] || DEC.MAYBE;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: m.bg, border: `1px solid ${m.color}40`, borderRadius: 6, padding: '3px 9px', color: m.color, fontFamily: FONT, fontSize: 11, whiteSpace: 'nowrap', fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

// ── Cache age badge ───────────────────────────────────────────────────────────
function CacheAgeBadge({ lastScannedAt }) {
  if (!lastScannedAt) return null;
  const label = cacheAgeLabel(lastScannedAt);
  const days  = Math.floor(cacheAgeDays(lastScannedAt));
  const color = label === 'Fresh' ? G : label === 'Older' ? ORANGE : RED;
  return (
    <span title={`Last scanned ${days}d ago`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: `${color}12`, border: `1px solid ${color}35`,
      borderRadius: 5, padding: '1px 6px', fontSize: 9,
      color, fontFamily: FONT, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <Clock size={8}/> {label} · {days}d
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UPCScanner({ onSwitchModule, userName }) {
  // CSV
  const [rawRows,        setRawRows]        = useState([]);
  const [headers,        setHeaders]        = useState([]);
  const [colMap,         setColMap]         = useState({ upc: null, price: null, desc: null, brand: null, supplierLink: null });
  const [showMapper,     setShowMapper]     = useState(false);
  const [fileName,       setFileName]       = useState('');
  const [csvErr,         setCsvErr]         = useState('');
  const [dragging,       setDragging]       = useState(false);
  // Rows from the supplier CSV that had no valid UPC (used in Brand Insider summary)
  const [missingUPCRows, setMissingUPCRows] = useState([]);

  // Settings panels
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // Scan
  const [scanStatus, setScanStatus] = useState('idle'); // idle|scanning|done|error
  const [progress,   setProgress]   = useState({ total: 0, scanned: 0, matched: 0, noMatch: 0, errors: 0 });
  const [scanErr,    setScanErr]     = useState('');
  const abortRef = useRef(false);

  // Results
  const [results, setResults] = useState([]);

  // Tab navigation: 'upload' | 'summary' | 'review'
  const [activeTab, setActiveTab] = useState('upload');

  // Auto-switch to Brand Summary tab when scan completes with results
  useEffect(() => {
    if (scanStatus === 'done' && results.length > 0) {
      setActiveTab('summary');
    }
  }, [scanStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-seed Brand Insider status from decision for new results
  useEffect(() => {
    if (!results.length) return;
    setRowStatus(prev => {
      const next = { ...prev };
      let changed = false;
      for (const r of results) {
        if (r.upc && next[r.upc] === undefined) {
          const def = defaultStatus(r.decision);
          if (def) { next[r.upc] = def; changed = true; }
        }
      }
      return changed ? next : prev;
    });
    // Seed supplier link from CSV colMap or UPC
    setRowSupplierLink(prev => {
      const next = { ...prev };
      let changed = false;
      for (const r of results) {
        if (r.upc && next[r.upc] === undefined) {
          next[r.upc] = r.supplierLink || r.originalUPC || r.upc || '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // Table controls
  const [decFilter,       setDecFilter]       = useState('ALL');
  const [sortKey,         setSortKey]         = useState('decision');
  const [sortDir,         setSortDir]         = useState('asc');
  const [minROIFilter,    setMinROIFilter]    = useState('');
  const [minProfitFilter, setMinProfitFilter] = useState('');

  // Manual pack count overrides — keyed by cleaned UPC string
  const [packCounts, setPackCounts] = useState({});

  // ── Brand Insider review fields — keyed by UPC ───────────────────────────────
  // Default Status is auto-set from decision; user can override per-row.
  const [rowStatus,       setRowStatus]       = useState({}); // 'Denied'|'Approved'|'Potential'
  const [rowNotes,        setRowNotes]        = useState({}); // editable brand insider notes
  const [rowPRMember,     setRowPRMember]     = useState({}); // PR team member name
  const [rowFbaFbm,       setRowFbaFbm]       = useState({}); // 'FBA'|'FBM'|'FBA/FBM'|'Unknown'
  const [rowSupplierLink, setRowSupplierLink] = useState({}); // supplier link/SKU/item code

  // Default status from decision when results arrive
  function defaultStatus(decision) {
    if (decision === 'GOOD')           return 'Potential';
    if (decision === 'MAYBE')          return 'Potential';
    if (decision === 'POSSIBLE_MATCH') return 'Potential';
    if (decision === 'PASS')           return 'Denied';
    return ''; // NO_MATCH → blank
  }

  // ── Cache / Saved Scans state ───────────────────────────────────────────────
  const [scanHistory,     setScanHistory]     = useState([]);   // upc_scan_sessions rows
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [savingSession,   setSavingSession]   = useState(false);
  const [savedSessionId,  setSavedSessionId]  = useState(null); // id of last saved session
  const [dupeBannerInfo,  setDupeBannerInfo]  = useState(null); // { overlapPct, sessionId, brandName }
  const [rescanMode,      setRescanMode]      = useState('cache'); // 'cache'|'all'|'missing'
  const [selectedRows,    setSelectedRows]    = useState(new Set());

  // Saved scan viewer
  const [viewingSession,   setViewingSession]   = useState(null);  // session metadata obj or null
  const [sessionLoading,   setSessionLoading]   = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState('');
  // Reconstructed valid rows from a saved scan — used so rescan works without a CSV
  const savedScanRowsRef = useRef([]);

  // Load scan history once on mount
  useEffect(() => {
    if (!hasSupabase) return;
    setHistoryLoading(true);
    loadScanSessions().then(rows => {
      setScanHistory(rows);
      setHistoryLoading(false);
    });
  }, []);

  // ── Map a saved upc_scan_results row + upc_product_cache row → result shape ──
  // This is the inverse of buildResult: reconstructs what ASIN Review expects.
  function mapSavedRowToResult(saved, cache) {
    const upc   = saved.normalized_upc || '';
    const price = saved.supplier_unit_price != null ? Number(saved.supplier_unit_price) : null;
    const packCt = saved.pack_count ?? 1;
    const totalCost = price != null ? price * packCt : null;

    const asin         = saved.asin      || cache?.asin      || null;
    const title        = saved.amazon_title || cache?.amazon_title || null;
    const brand        = cache?.amazon_brand || null;
    const category     = cache?.category    || null;
    const imgUrl       = cache?.image_url   || null;
    const amazonUrl    = cache?.amazon_url  || (asin ? `https://www.amazon.com/dp/${asin}` : null);
    const buyBox       = saved.buy_box   != null ? Number(saved.buy_box)   : (cache?.buy_box   != null ? Number(cache.buy_box)   : null);
    const calcPrice    = cache?.calc_price  != null ? Number(cache.calc_price)  : buyBox;
    const calcPriceLabel = cache?.price_source || (calcPrice != null ? 'Buy Box' : 'Missing');
    const fbaFee       = cache?.fba_fee  != null ? Number(cache.fba_fee)  : null;
    const bsr          = saved.bsr       != null ? Number(saved.bsr)       : (cache?.bsr != null ? Number(cache.bsr) : null);
    const bsrLabel     = cache?.bsr_label || null;
    const sellers      = cache?.sellers  != null ? Number(cache.sellers)   : null;
    const amzInStock   = cache?.amazon_in_stock ?? false;
    const pkgWeight    = cache?.package_weight  || null;
    const pkgDims      = cache?.pkg_dims        || null;
    const matchType    = saved.match_type       || 'No Match';
    const scanValidation = cache?.validation_status || null;
    const decision     = saved.decision         || 'NO_MATCH';
    const notes        = saved.notes            || cache?.scan_notes || '';
    const cacheStatus  = saved.cache_status     || 'cached';
    const lastKeepaScannedAt = saved.last_keepa_scan_date || null;

    // Reconstruct a minimal pc object for display (referral not stored → null)
    const profit  = saved.estimated_profit != null ? Number(saved.estimated_profit) : null;
    const roi     = saved.roi              != null ? Number(saved.roi)              : null;
    const margin  = saved.margin           != null ? Number(saved.margin)           : null;
    const pc = (profit != null || roi != null) ? { profit, roi, margin, referral: null, fba: fbaFee, fbaSource: 'Saved' } : null;

    // Reconstruct amazon search url for POSSIBLE_MATCH rows
    const amazonSearchUrl = (matchType === 'Search Link' && saved.supplier_description)
      ? `https://www.amazon.com/s?k=${encodeURIComponent(saved.supplier_description)}`
      : null;

    return {
      upc, originalUPC: upc, price, desc: saved.supplier_description || '',
      supplierBrand: null,
      supplierLink: saved.supplier_link_or_code || upc || '',
      // pack count stored separately — pre-populate packCounts state
      _savedPackCount: packCt,
      // brand insider review fields — pre-populate from saved row
      _savedStatus:       saved.brand_insider_status || null,
      _savedNotes:        saved.brand_insider_notes  || null,
      _savedPRMember:     saved.pr_member            || null,
      _savedFbaFbm:       saved.fba_fbm              || null,
      _savedSupplierLink: saved.supplier_link_or_code || upc || '',
      _savedAwlPct:       saved.awl_fee_percent      ?? null,
      asin, title, brand, category, imgUrl, amazonUrl,
      buyBox, calcPrice, calcPriceLabel, sellingPrice: calcPrice, priceSource: calcPriceLabel,
      fbaFee, bsr, bsrLabel, bsr90: null, sellers, amzInStock, pkgWeight, pkgDims,
      matchType, scanValidation, decision, notes, pc,
      amazonSearchUrl, cacheStatus, lastKeepaScannedAt,
    };
  }

  // ── Open a saved scan session — loads from Supabase, NO Keepa calls ──────────
  const openSavedScan = useCallback(async (session) => {
    setSessionLoading(true);
    setSessionLoadError('');
    setActiveTab('review');

    try {
      const { savedRows, cacheByUpc } = await loadSessionWithCache(session.id);

      if (!savedRows.length) {
        setSessionLoadError('No result rows found for this saved scan.');
        setSessionLoading(false);
        return;
      }

      // Map saved rows to result objects
      const mapped = savedRows.map(r => mapSavedRowToResult(r, cacheByUpc[r.normalized_upc] || null));

      // Pre-populate packCounts and review fields from saved values
      const newPackCounts = {}, newStatus = {}, newNotes = {},
            newPR = {}, newFbaFbm = {}, newSupLink = {};
      for (const r of mapped) {
        if (!r.upc) continue;
        if (r._savedPackCount && r._savedPackCount > 1)  newPackCounts[r.upc] = r._savedPackCount;
        if (r._savedStatus)                              newStatus[r.upc]    = r._savedStatus;
        if (r._savedNotes)                               newNotes[r.upc]     = r._savedNotes;
        if (r._savedPRMember)                            newPR[r.upc]        = r._savedPRMember;
        if (r._savedFbaFbm)                              newFbaFbm[r.upc]    = r._savedFbaFbm;
        if (r._savedSupplierLink)                        newSupLink[r.upc]   = r._savedSupplierLink;
      }
      setPackCounts(prev    => ({ ...prev, ...newPackCounts }));
      setRowStatus(prev     => ({ ...prev, ...newStatus }));
      setRowNotes(prev      => ({ ...prev, ...newNotes }));
      setRowPRMember(prev   => ({ ...prev, ...newPR }));
      setRowFbaFbm(prev     => ({ ...prev, ...newFbaFbm }));
      setRowSupplierLink(prev => ({ ...prev, ...newSupLink }));

      // Store reconstructed valid rows so rescan buttons can work
      savedScanRowsRef.current = mapped
        .filter(r => r.upc)   // UPC is the only hard requirement
        .map(r => ({ upc: r.upc, price: r.price ?? null, desc: r.desc || '', originalUPC: r.originalUPC || r.upc, supplierBrand: r.supplierBrand || session.brand_name }));

      setResults(mapped);
      setViewingSession(session);
      setScanStatus('done');
    } catch (err) {
      setSessionLoadError('Could not load saved scan results: ' + err.message);
    }
    setSessionLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear viewing session when a new file is uploaded / scan started
  const clearViewingSession = () => {
    setViewingSession(null);
    setSessionLoadError('');
    savedScanRowsRef.current = [];
  };

  // ── Duplicate/overlap detection after CSV load ──────────────────────────────
  const checkDuplicateBrand = useCallback(async (fileNameArg, upcs) => {
    if (!hasSupabase || !scanHistory.length || !upcs.length) return;
    const upcSet = new Set(upcs);
    let bestMatch = null;
    let bestOverlap = 0;
    for (const session of scanHistory) {
      // Name match
      const nameMatch = session.brand_name &&
        (fileNameArg.toLowerCase().includes(session.brand_name.toLowerCase()) ||
         session.brand_name.toLowerCase().includes(fileNameArg.toLowerCase().replace(/\.(csv|xlsx?|tsv)$/i, '')));
      if (nameMatch && upcSet.size > 0) {
        // Quick estimate: assume 80% overlap for name match (full check is expensive without fetching all results)
        if (80 > bestOverlap) { bestOverlap = 80; bestMatch = session; }
      }
    }

    // Full UPC overlap check against cache
    if (upcSet.size > 0) {
      const cacheMap = await checkCacheBatch([...upcSet]);
      const cachedCount = Object.keys(cacheMap).length;
      const overlapPct = Math.round((cachedCount / upcSet.size) * 100);
      if (overlapPct >= 60) {
        setDupeBannerInfo({ overlapPct, cachedCount, total: upcSet.size });
      } else {
        setDupeBannerInfo(null);
      }
    }
  }, [scanHistory]);

  // ── CSV processing ──────────────────────────────────────────────────────────
  const processCSV = useCallback(file => {
    setCsvErr(''); setResults([]); setScanStatus('idle');
    setFileName(file.name); setMissingUPCRows([]);
    setDupeBannerInfo(null); setSavedSessionId(null);
    clearViewingSession();
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: ({ data, meta }) => {
        if (!data.length) { setCsvErr('The CSV file is empty.'); return; }
        const hdrs = meta.fields || [];
        setHeaders(hdrs); setRawRows(data);
        const det = detectColumns(hdrs);
        setColMap(det);
        // UPC is the only hard-required column. Price and Description are recommended.
        if (!det.upc) {
          setShowMapper(true);
          setCsvErr('Could not auto-detect UPC column. Please map it below.');
        } else {
          setShowMapper(false);
          setCsvErr('');
          // Advisory warnings for recommended-but-missing columns
          const advisory = [!det.price && 'Price', !det.desc && 'Product Description'].filter(Boolean);
          if (advisory.length) {
            setCsvErr(`Recommended column(s) not detected: ${advisory.join(', ')}. Profit/ROI calculations and similar-product search will be limited. You can map them below or proceed with UPC-only scan.`);
            setShowMapper(true);
          }
        }
        // After detection: run duplicate/overlap check in background
        if (det.upc) {
          const normFn = v => { let s = String(v||'').trim(); if (s.includes('.')) s=s.split('.')[0]; return s.replace(/[^0-9]/g,''); };
          const upcs = data.map(r => normFn(r[det.upc]||'')).filter(Boolean);
          checkDuplicateBrand(file.name, upcs);
        }
      },
      error: e => setCsvErr(`CSV parse error: ${e.message}`),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileInput = e => { const f = e.target.files?.[0]; if (f) processCSV(f); e.target.value = ''; };
  const handleDrop = e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f?.name.endsWith('.csv')) processCSV(f); };

  // ── Validate + deduplicate rows ─────────────────────────────────────────────
  // Returns { valid: [...], missing: [...] } or null on fatal error.
  // valid   — rows with clean UPCs, ready to scan
  // missing — rows where UPC was blank or invalid ("UPC not available in Supplier")
  function prepareRows() {
    // UPC is the only hard-required column. Price and Description are recommended.
    if (!colMap.upc)     { setCsvErr('UPC column is required. Please map it below.'); return null; }
    if (!rawRows.length) { setCsvErr('No data rows in CSV.'); return null; }

    // Default group name = file name without extension, or fallback string
    const defaultGroup = fileName
      ? fileName.replace(/\.(csv|xlsx?|tsv)$/i, '').trim() || 'Uploaded Supplier File'
      : 'Uploaded Supplier File';

    const seen    = new Set();
    const valid   = [];
    const missing = []; // rows where UPC was blank or invalid in supplier CSV

    for (const row of rawRows) {
      const rawUPC = row[colMap.upc] || '';
      // Supplier brand from optional column, or default group
      const supplierBrand = colMap.brand
        ? ((row[colMap.brand] || '').trim() || defaultGroup)
        : defaultGroup;

      // If UPC field is blank or becomes empty after cleaning → missing in supplier
      if (!rawUPC.trim()) { missing.push({ supplierBrand }); continue; }
      const upc = cleanUPC(rawUPC);
      if (!upc)           { missing.push({ supplierBrand }); continue; }

      if (seen.has(upc)) continue; // deduplicate
      seen.add(upc);

      // Price and description are recommended but not required.
      // null price  → profit/ROI will not be calculated (noted in buildResult).
      // empty desc  → Possible Match / Search Similar disabled for this row (noted in buildResult).
      const price   = colMap.price ? cleanPrice(row[colMap.price])     : null;
      const rawDesc = colMap.desc  ? (row[colMap.desc] || '').trim()   : '';

      const supplierLink = colMap.supplierLink ? (row[colMap.supplierLink] || '').trim() : '';
      valid.push({ upc, price, desc: rawDesc, originalUPC: rawUPC.trim(), supplierBrand, supplierLink });
    }

    if (!valid.length) {
      setCsvErr('No valid rows found. Check that the UPC column contains values.');
      return null;
    }
    return { valid, missing };
  }

  // ── Build result row ────────────────────────────────────────────────────────
  // scanValidation: 'exact_barcode' | 'positional_unverified' | null
  // scanNote:       backend message to surface in the UI
  function buildResult(row, kd, warning, scanValidation = null, scanNote = null) {
    // If supplier price is missing, profit/ROI cannot be calculated.
    // Pass null price into calcProfit so it returns null → classify returns MAYBE.
    const pc       = kd ? calcProfit(kd.calcPrice, row.price, kd.fbaFee, settings) : null;
    let   decision = kd ? classify(kd, pc, settings) : 'NO_MATCH';

    // ── Possible Match via Amazon search link ───────────────────────────────
    // Only generated when NO_MATCH AND description is available.
    // If description is missing, row stays NO_MATCH (no search link possible).
    let amazonSearchUrl = null;
    if (decision === 'NO_MATCH' && row.desc && row.desc.trim()) {
      const searchTerms = [row.desc.trim()];
      amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerms.join(' '))}`;
      decision = 'POSSIBLE_MATCH';
    }

    // Match type for the "Match Type" table column
    const matchType = kd?.asin
      ? (scanValidation === 'exact_barcode' ? 'Exact UPC' : 'Unverified')
      : (amazonSearchUrl ? 'Search Link' : 'No Match');

    const notes = [];
    if (warning)                                           notes.push(warning);
    if (scanNote)                                          notes.push(scanNote);
    if (scanValidation === 'positional_unverified')        notes.push('⚠ UPC matched by position only — verify manually.');
    if (decision === 'POSSIBLE_MATCH')                     notes.push('No exact UPC match. Candidate found by product description — verify manually before listing.');
    // Missing supplier price
    if (row.price == null)                                 notes.push('Missing supplier price — profit not calculated.');
    // Missing product description
    if (!row.desc || !row.desc.trim())                     notes.push('Product description missing — similar search unavailable.');
    if (kd?.calcPriceLabel === 'Missing')                  notes.push('Missing Amazon price — profit not calculated.');
    if (kd?.calcPriceLabel === 'New Price')                notes.push('Profit calculated using New Price (no Buy Box).');
    if (kd?.calcPriceLabel === 'Amazon')                   notes.push('Profit calculated using Amazon price (no Buy Box).');
    if (pc?.fbaSource === 'Fallback')                      notes.push('FBA fee missing — using fallback.');
    if (kd && !kd.bsr)                                     notes.push('BSR unavailable.');
    if (kd?.bsrLabel && kd.bsrLabel !== 'Current BSR')    notes.push(`BSR source: ${kd.bsrLabel}.`);

    return { ...row, ...kd, pc, decision, scanValidation, matchType, amazonSearchUrl, notes: notes.join(' ') };
  }

  // ── Scan ────────────────────────────────────────────────────────────────────
  const BATCH = 20;

  // ── Core scan executor (cache-aware) ────────────────────────────────────────
  // forceRescanUpcs: Set of UPCs to always call Keepa for, ignoring cache.
  // If null/undefined → use rescanMode ('cache'=use cache, 'all'=rescan all,
  //                                       'missing'=rescan no-match/possible only)
  const runScan = useCallback(async (rows, forceRescanUpcs = null) => {
    setCsvErr(''); setScanErr('');
    abortRef.current = false;
    setScanStatus('scanning');
    setResults([]);
    setProgress({ total: rows.length, scanned: 0, matched: 0, noMatch: 0, errors: 0 });

    let scanned = 0, matched = 0, noMatch = 0, errors = 0;
    const allResults = [];
    const nowISO = new Date().toISOString();

    // ── Step 1: bulk cache lookup for all UPCs in this scan ──────────────────
    const allUpcs   = rows.map(r => r.upc);
    const cacheMap  = await checkCacheBatch(allUpcs);
    let cachedCount = 0;

    console.log(`[scan] mode=${forceRescanUpcs ? 'force' : rescanMode} | rows=${rows.length} | cacheHits=${Object.keys(cacheMap).length}`);

    // Determine which UPCs need a Keepa call based on rescan mode
    const needsKeepa = rows.filter(row => {
      if (forceRescanUpcs?.has(row.upc)) {
        console.log(`[scan] UPC=${row.upc} → KEEPA (force rescan)`);
        return true;
      }
      if (rescanMode === 'all') {
        console.log(`[scan] UPC=${row.upc} → KEEPA (mode=all)`);
        return true;
      }
      const cached = cacheMap[row.upc];
      if (!cached) {
        console.log(`[scan] UPC=${row.upc} → KEEPA (cache miss)`);
        return true;
      }
      if (rescanMode === 'missing') {
        const lastDec = cached.match_type;
        const needsIt = lastDec === 'No Match' || lastDec === 'Search Link';
        if (needsIt) console.log(`[scan] UPC=${row.upc} → KEEPA (missing rescan, cached match_type=${lastDec})`);
        else         console.log(`[scan] UPC=${row.upc} → CACHE (missing mode but match_type=${lastDec})`);
        return needsIt;
      }
      // Default: rescanMode === 'cache' — use cache for this UPC
      console.log(`[scan] UPC=${row.upc} → CACHE (hit, match_type=${cached.match_type ?? 'none'}, asin=${cached.asin ?? 'none'})`);
      return false;
    });

    console.log(`[scan] Keepa needed: ${needsKeepa.length} | Using cache: ${rows.length - needsKeepa.length}`);

    // ── Step 2: Apply cached results immediately ──────────────────────────────
    const needsKeepaSet = new Set(needsKeepa.map(r => r.upc)); // O(1) lookup
    for (const row of rows) {
      if (needsKeepaSet.has(row.upc)) continue; // handled in Step 3
      const cached = cacheMap[row.upc];
      if (!cached) continue; // safety — should be in needsKeepa
      scanned++;
      cachedCount++;
      const kd = cacheRowToKeepaData(cached);
      // Pass kd for exact matches; null for No Match / Possible Match (rebuilt by buildResult)
      // Pass cached.validation_status so positional_unverified warning is preserved
      const result = buildResult(row, kd.asin ? kd : null, '', kd.asin ? (cached.validation_status ?? null) : null, null);
      allResults.push({
        ...result,
        cacheStatus:       'cached',
        lastKeepaScannedAt: cached.last_scanned_at,
        // Preserve cached match_type for badge display
        _cachedMatchType:  cached.match_type ?? null,
      });
      if (kd.asin) matched++; else noMatch++;
      setProgress({ total: rows.length, scanned, matched, noMatch, errors });
    }
    setResults([...allResults]);

    // ── Step 3: Keepa API calls for uncached / rescan UPCs ───────────────────
    for (let i = 0; i < needsKeepa.length; i += BATCH) {
      if (abortRef.current) break;

      const batch = needsKeepa.slice(i, i + BATCH);
      const upcs  = batch.map(r => r.upc);

      let batchResults = {};
      try {
        const res = await fetch('/api/keepa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upcs }),
        });

        if (res.status === 429) {
          setScanErr('Keepa token limit reached. Please wait before continuing.');
          setScanStatus('error');
          break;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 404) {
            setScanErr('API endpoint not found. Run "vercel dev" instead of "npm run dev" to test Keepa locally, or deploy to Vercel.');
            setScanStatus('error');
            break;
          }
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.tokenLimitReached) {
          setScanErr('Keepa token limit reached. Please wait before continuing.');
          setScanStatus('error');
          break;
        }
        batchResults = data.results || {};
      } catch (err) {
        errors += batch.length; scanned += batch.length;
        for (const row of batch) allResults.push({ ...buildResult(row, null, `API error: ${err.message}`), cacheStatus: 'fresh_scan', lastKeepaScannedAt: nowISO });
        setProgress({ total: rows.length, scanned, matched, noMatch, errors });
        setResults([...allResults]);
        continue;
      }

      for (const row of batch) {
        scanned++;
        const products = batchResults[row.upc] || [];

        if (!products.length) {
          noMatch++;
          const r = { ...buildResult(row, null, ''), cacheStatus: 'fresh_scan', lastKeepaScannedAt: nowISO };
          allResults.push(r);
          writeCacheEntry(r);
          console.log(`[scan] UPC=${row.upc} → Keepa no products → match_type=${r.matchType} cached`);
          continue;
        }

        const sentinel = products[0];
        if (sentinel?._scanValidation === 'barcode_mismatch') {
          noMatch++;
          const r = { ...buildResult(row, null, `Keepa returned ASIN ${sentinel._rejectedASIN} but its barcodes do not match this UPC. Marked as No Match.`), cacheStatus: 'fresh_scan', lastKeepaScannedAt: nowISO };
          allResults.push(r);
          // ── BUG FIX: cache barcode_mismatch so repeat scans don't re-call Keepa ──
          writeCacheEntry(r);
          console.log(`[scan] UPC=${row.upc} barcode_mismatch → cached as match_type=${r.matchType}`);
          continue;
        }

        const realProducts = products.filter(p => p.asin);
        if (!realProducts.length) {
          noMatch++;
          const r = { ...buildResult(row, null, ''), cacheStatus: 'fresh_scan', lastKeepaScannedAt: nowISO };
          allResults.push(r);
          writeCacheEntry(r);
          console.log(`[scan] UPC=${row.upc} → Keepa no real ASINs → match_type=${r.matchType} cached`);
          continue;
        }

        const best = realProducts.reduce((a, b) => {
          const pa = kp(a?.stats?.current?.[18]) ?? kp(a?.stats?.current?.[1]) ?? 0;
          const pb = kp(b?.stats?.current?.[18]) ?? kp(b?.stats?.current?.[1]) ?? 0;
          return pb > pa ? b : a;
        });

        const scanValidation = best._scanValidation || 'positional_unverified';
        const scanNote       = best._scanNote       || null;
        const isRescan       = forceRescanUpcs?.has(row.upc) || rescanMode !== 'cache';

        matched++;
        const r = {
          ...buildResult(row, extractKeepaData(best), '', scanValidation, scanNote),
          cacheStatus: isRescan && cacheMap[row.upc] ? 'rescanned' : 'fresh_scan',
          lastKeepaScannedAt: nowISO,
        };
        allResults.push(r);
        writeCacheEntry(r); // fire-and-forget save to cache
        console.log(`[scan] UPC=${row.upc} → Keepa match ASIN=${r.asin} match_type=${r.matchType} cached`);
      }

      setProgress({ total: rows.length, scanned, matched, noMatch, errors });
      setResults([...allResults]);
      if (i + BATCH < needsKeepa.length) await new Promise(r => setTimeout(r, 350));
    }

    setScanStatus(prev => prev === 'error' ? 'error' : 'done');
    console.log(`[UPCScanner] scan done — ${cachedCount} from cache, ${needsKeepa.length} Keepa calls, ${allResults.length} total rows`);
    return allResults;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap, settings, rescanMode]);

  const startScan = useCallback(async () => {
    const prep = prepareRows();
    if (!prep) return;
    const { valid: rows, missing: newMissingRows } = prep;
    setMissingUPCRows(newMissingRows);
    const allResults = await runScan(rows);

    // Save session + results to Supabase after scan completes
    if (hasSupabase && allResults?.length) {
      setSavingSession(true);
      const defaultGroup = fileName
        ? fileName.replace(/\.(csv|xlsx?|tsv)$/i, '').trim() || 'Uploaded Supplier File'
        : 'Uploaded Supplier File';
      const brandGroups = [...new Set(allResults.map(r => r.supplierBrand || defaultGroup))];
      const primaryBrand = brandGroups[0] || defaultGroup;

      const summ = {
        total: allResults.length,
        matched: allResults.filter(r => r.asin).length,
        good: allResults.filter(r => r.decision === 'GOOD').length,
        maybe: allResults.filter(r => r.decision === 'MAYBE').length,
        pass: allResults.filter(r => r.decision === 'PASS').length,
        possibleMatch: allResults.filter(r => r.decision === 'POSSIBLE_MATCH').length,
        noMatch: allResults.filter(r => r.decision === 'NO_MATCH').length,
      };
      const sessionId = await saveScanSession({
        brandName: primaryBrand,
        sourceFileName: fileName,
        summary: summ,
        missingUPCCount: newMissingRows.length,
        userName,
      });
      if (sessionId) {
        setSavedSessionId(sessionId);
        await saveScanResults(sessionId, allResults, packCounts, { rowStatus, rowNotes, rowPRMember, rowFbaFbm, rowSupplierLink, settings });
        // Refresh history
        const updated = await loadScanSessions();
        setScanHistory(updated);
      }
      setSavingSession(false);
    }
    // Reset to default cache mode after every startScan so the next scan
    // doesn't accidentally re-run in 'all' or 'missing' mode.
    setRescanMode('cache');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap, settings, rescanMode, runScan, fileName, userName, packCounts]);

  const stopScan = () => { abortRef.current = true; setScanStatus('done'); };

  // ── Helper: get valid rows — from CSV if available, else from saved scan ──────
  const getValidRows = useCallback(() => {
    if (rawRows.length) {
      const prep = prepareRows();
      return prep ? { rows: prep.valid, missing: prep.missing } : null;
    }
    if (savedScanRowsRef.current.length) {
      return { rows: savedScanRowsRef.current, missing: [] };
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap]);

  // Rescan All — force Keepa for every UPC
  const handleRescanAll = useCallback(async () => {
    const prep = getValidRows();
    if (!prep) return;
    clearViewingSession();
    setMissingUPCRows(prep.missing);
    const forceAll = new Set(prep.rows.map(r => r.upc));
    await runScan(prep.rows, forceAll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap, settings, runScan, getValidRows]);

  // Rescan Missing — force Keepa only for NO_MATCH / POSSIBLE_MATCH rows
  const handleRescanMissing = useCallback(async () => {
    const prep = getValidRows();
    if (!prep) return;
    clearViewingSession();
    setMissingUPCRows(prep.missing);
    const missingUpcs = new Set(
      results
        .filter(r => r.decision === 'NO_MATCH' || r.decision === 'POSSIBLE_MATCH')
        .map(r => r.upc)
    );
    await runScan(prep.rows, missingUpcs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap, settings, runScan, results, getValidRows]);

  // Rescan Selected — force Keepa only for rows checked by user
  const handleRescanSelected = useCallback(async () => {
    if (!selectedRows.size) return;
    const prep = getValidRows();
    if (!prep) return;
    clearViewingSession();
    setMissingUPCRows(prep.missing);
    await runScan(prep.rows, new Set(selectedRows));
    setSelectedRows(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, colMap, settings, runScan, selectedRows, getValidRows]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!results.length) return;
    const date = new Date().toISOString().slice(0, 10);
    const rows = results.map(r => {
      const pc              = packCounts[r.upc] ?? 1;
      const totalCost       = r.price * pc;
      const exportPc        = pc > 1 ? calcProfit(r.calcPrice, totalCost, r.fbaFee, settings) : r.pc;
      return ({
      'Scan Date':              date,
      'Source File':            fileName,
      'UPC':                    r.originalUPC || r.upc,
      'Product Description':    r.desc,
      'Supplier Unit Price':    r.price,
      'Pack Count':             pc,
      'Total Supplier Cost':    totalCost.toFixed(2),
      'ASIN':             r.asin || '',
      'Amazon Title':     r.title || '',
      'Brand':            r.brand || '',
      'Category':         r.category || '',
      'Amazon URL':       r.amazonUrl || '',
      'Buy Box Price':    r.buyBox ?? '',
      'Calc Price':       r.calcPrice ?? '',
      'Price Source':     r.calcPriceLabel || '',
      'FBA Fee':          r.fbaFee ?? '',
      'Ref. Fee Est.':    exportPc ? exportPc.referral.toFixed(2) : '',
      'Est. Profit':      exportPc ? exportPc.profit.toFixed(2) : '',
      'ROI %':            exportPc?.roi != null ? exportPc.roi.toFixed(1) : '',
      'Margin %':         exportPc?.margin != null ? exportPc.margin.toFixed(1) : '',
      'BSR':              r.bsr ?? '',
      'BSR Source':       r.bsrLabel || (r.bsr ? 'Current BSR' : ''),
      'Seller Count':     r.sellers ?? '',
      'Amazon In Stock':  r.asin ? (r.amzInStock ? 'Yes' : 'No') : '',
      'Pkg Weight':       r.pkgWeight || '',
      'Pkg Dims':         r.pkgDims || '',
      'Decision':             DEC[r.decision]?.label || r.decision,
      'Status':               rowStatus[r.upc]       || '',
      'Brand Insider Notes':  rowNotes[r.upc]        || '',
      'PR Member':            rowPRMember[r.upc]     || '',
      'FBA/FBM':              rowFbaFbm[r.upc]       || (r.asin ? 'FBA' : 'Unknown'),
      'Supplier Link/UPC':    rowSupplierLink[r.upc] || r.originalUPC || r.upc || '',
      'AWL Fee %':            settings.awlPct ?? 10,
      'AWL Fee $':            exportPc?.awlFee != null ? exportPc.awlFee.toFixed(2) : (r.calcPrice != null ? (r.calcPrice * ((settings.awlPct ?? 10) / 100)).toFixed(2) : ''),
      'Cache Status':         r.cacheStatus === 'cached' ? 'Cached' : r.cacheStatus === 'rescanned' ? 'Rescanned' : 'Fresh Scan',
      'Last Keepa Scan Date': r.lastKeepaScannedAt ? new Date(r.lastKeepaScannedAt).toLocaleDateString() : '',
      'Notes':                r.notes || '',
    }); });
    const csv  = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `upc-scan-${date}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export Brand Insider XLSX ───────────────────────────────────────────────
  const handleExportXLSX = () => {
    if (!results.length) return;
    const date     = new Date().toISOString().slice(0, 10);
    const awlPct   = settings.awlPct ?? 10;

    // ── Row builder ────────────────────────────────────────────────────────────
    const buildBIRow = r => {
      const pc         = packCounts[r.upc] ?? 1;
      const totalCost  = r.price != null ? r.price * pc : null;
      const effectiveCost = totalCost;
      const exportPc   = pc > 1 ? calcProfit(r.calcPrice, effectiveCost, r.fbaFee, settings) : r.pc;
      const awlFeeAmt  = r.calcPrice != null ? r.calcPrice * (awlPct / 100) : null;
      const groupName  = r.supplierBrand || (fileName ? fileName.replace(/\.(csv|xlsx?|tsv)$/i, '').trim() : 'Supplier');
      return {
        'Brand Name/Supplier Name':  groupName,
        'Status':                    rowStatus[r.upc]       || '',
        'QTY to Purchase':           '',
        'Purchased Type':            '',
        'Profit (10% AWL Charge)':   exportPc?.profit != null ? Number(exportPc.profit).toFixed(2) : '',
        'Percentage AWL Charge':     awlPct + '%',
        'AWL Fee $':                 awlFeeAmt != null ? Number(awlFeeAmt).toFixed(2) : '',
        'Total Purchase Value':      totalCost != null ? Number(totalCost).toFixed(2) : '',
        'Units Sold':                '',
        'Ranking':                   r.bsr ?? '',
        'Brand Insider Notes':       rowNotes[r.upc]    || '',
        'Notes':                     r.notes            || '',
        'PR Member':                 rowPRMember[r.upc] || '',
        'FBA/FBM':                   rowFbaFbm[r.upc]   || (r.asin ? 'FBA' : 'Unknown'),
        'ASIN':                      r.asin             || '',
        'Product Description':       r.desc             || r.title || '',
        'Amazon Link':               r.amazonUrl        || '',
        'Supplier Link/UPC/Item Code': rowSupplierLink[r.upc] || r.originalUPC || r.upc || '',
        'Unit Cost':                 r.price            != null ? Number(r.price).toFixed(4) : '',
        'AMZ Pack/Bundle/QTY':       pc,
      };
    };

    // ── Tab 1: Product Research — all rows with any ASIN or candidate data ────
    const productResearch = results
      .filter(r => r.asin || r.decision === 'POSSIBLE_MATCH')
      .map(buildBIRow);

    // ── Tab 2: Not available in Amazon — UPC sent but no exact ASIN found ─────
    const notOnAmazon = results
      .filter(r => r.decision === 'NO_MATCH' || r.decision === 'POSSIBLE_MATCH')
      .map(r => ({
        'UPC':                 r.originalUPC || r.upc,
        'Product Description': r.desc        || '',
        'Supplier Unit Price': r.price != null ? Number(r.price).toFixed(4) : '',
        'Notes':               r.notes       || '',
        'Amazon Search Link':  r.amazonSearchUrl || '',
      }));

    // ── Tab 3: Not available in Supplier — rows with no UPC in supplier CSV ───
    const defaultGroup = fileName
      ? fileName.replace(/\.(csv|xlsx?|tsv)$/i, '').trim() || 'Supplier'
      : 'Supplier';
    const notInSupplier = missingUPCRows.map(r => ({
      'Brand/Group': r.supplierBrand || defaultGroup,
      'Notes':       'UPC not available in supplier file',
    }));

    // ── Tab 4: Potential Products ─────────────────────────────────────────────
    const potential = results
      .filter(r => rowStatus[r.upc] === 'Potential' || r.decision === 'GOOD' || r.decision === 'MAYBE')
      .map(buildBIRow);

    // ── Tab 5: Checklist placeholder ──────────────────────────────────────────
    const checklist = [
      { 'Review Checklist': 'Check pack quantity matches Amazon listing' },
      { 'Review Checklist': 'Confirm exact UPC match before purchasing' },
      { 'Review Checklist': 'Check Amazon listing variation / parent ASIN' },
      { 'Review Checklist': 'Verify Buy Box price and FBA fees' },
      { 'Review Checklist': 'Verify supplier unit cost is correct' },
      { 'Review Checklist': 'Check profitability manually before purchase' },
      { 'Review Checklist': 'Confirm AWL 10% fee is applied to profit calculation' },
      { 'Review Checklist': 'Check BSR / sales rank trend' },
      { 'Review Checklist': 'Review seller count and competition' },
      { 'Review Checklist': 'Check Amazon in-stock status' },
    ];

    const wb = XLSX.utils.book_new();

    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } } };

    const addSheet = (name, data) => {
      if (!data.length) data = [{}]; // avoid empty sheet error
      const ws = XLSX.utils.json_to_sheet(data);
      // Set column widths
      const colCount = Object.keys(data[0] || {}).length;
      ws['!cols'] = Array(colCount).fill({ wch: 22 });
      // Freeze top row
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet('Product Research',        productResearch.length ? productResearch : [{ Note: 'No matched products' }]);
    addSheet('Not Available in Amazon', notOnAmazon.length     ? notOnAmazon     : [{ Note: 'All UPCs found on Amazon' }]);
    addSheet('Not Available in Supplier', notInSupplier.length ? notInSupplier   : [{ Note: 'All supplier rows had UPCs' }]);
    addSheet('Potential Products',      potential.length       ? potential        : [{ Note: 'No potential products yet' }]);
    addSheet('Checklist',               checklist);

    XLSX.writeFile(wb, `brand-insider-${date}.xlsx`);
  };

  // ── Sort / filter ───────────────────────────────────────────────────────────
  // IMPORTANT: use !== '' not truthy check. '0' is truthy but should mean "filter >= 0",
  // and '' (blank) must mean "no filter at all". Previously if the user typed 0
  // in the filter box, it became '0' (truthy) and silently filtered out No Match / Pass rows.
  const filtered = useMemo(() => {
    let r = results;
    if (decFilter !== 'ALL')       r = r.filter(x => x.decision === decFilter);
    if (minROIFilter !== '')       r = r.filter(x => (x.pc?.roi    ?? -Infinity) >= Number(minROIFilter));
    if (minProfitFilter !== '')    r = r.filter(x => (x.pc?.profit ?? -Infinity) >= Number(minProfitFilter));
    return [...r].sort((a, b) => {
      let va, vb;
      if      (sortKey === 'decision') { va = DEC_ORDER[a.decision] ?? 9;     vb = DEC_ORDER[b.decision] ?? 9; }
      else if (sortKey === 'roi')      { va = a.pc?.roi    ?? -Infinity;       vb = b.pc?.roi    ?? -Infinity; }
      else if (sortKey === 'profit')   { va = a.pc?.profit ?? -Infinity;       vb = b.pc?.profit ?? -Infinity; }
      else if (sortKey === 'bsr')      { va = a.bsr ?? Infinity;               vb = b.bsr ?? Infinity; }
      else if (sortKey === 'sellers')  { va = a.sellers ?? Infinity;           vb = b.sellers ?? Infinity; }
      else if (sortKey === 'buyBox')   { va = a.buyBox ?? -Infinity;           vb = b.buyBox ?? -Infinity; }
      else if (sortKey === 'price')    { va = a.price ?? 0;                    vb = b.price ?? 0; }
      else                             { va = 0; vb = 0; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [results, decFilter, minROIFilter, minProfitFilter, sortKey, sortDir]);

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // ── Quick summary (dashboard cards) ─────────────────────────────────────────
  const summary = useMemo(() => {
    const good = results.filter(r => r.decision === 'GOOD');
    return {
      total:      results.length,
      matched:    results.filter(r => r.asin).length,
      good:       good.length,
      maybe:         results.filter(r => r.decision === 'MAYBE').length,
      pass:          results.filter(r => r.decision === 'PASS').length,
      possibleMatch: results.filter(r => r.decision === 'POSSIBLE_MATCH').length,
      noMatch:       results.filter(r => r.decision === 'NO_MATCH').length,
      goodProfit:    good.reduce((s, r) => s + (r.pc?.profit ?? 0), 0),
    };
  }, [results]);

  // ── Brand Insider Summary (grouped by supplier brand) ────────────────────────
  const brandInsiderSummary = useMemo(() => {
    if (!results.length && !missingUPCRows.length) return [];

    const defaultGroup = fileName
      ? fileName.replace(/\.(csv|xlsx?|tsv)$/i, '').trim() || 'Uploaded Supplier File'
      : 'Uploaded Supplier File';

    const getBrand = r => r.supplierBrand || defaultGroup;

    // Collect all unique brands across results AND missing-UPC rows
    const allBrands = new Set([
      ...results.map(getBrand),
      ...missingUPCRows.map(getBrand),
    ]);

    return [...allBrands].sort().map(brand => {
      const brandResults = results.filter(r => getBrand(r) === brand);
      const brandMissing = missingUPCRows.filter(r => getBrand(r) === brand);

      // Only count exact barcode-validated matches as "found"
      const exactMatches = brandResults.filter(r => r.scanValidation === 'exact_barcode');
      const asinsFound   = exactMatches.length;

      // Profitable = exact match + profit > 0 + ROI meets target
      // Recalculate using manual pack count if user changed it
      const profitableASINs = exactMatches.filter(r => {
        const pc        = packCounts[r.upc] ?? 1;
        const totalCost = r.price * pc;
        const recalc    = pc > 1 ? calcProfit(r.calcPrice, totalCost, r.fbaFee, settings) : r.pc;
        return recalc != null && recalc.profit > 0 && (recalc.roi ?? 0) >= settings.minROI;
      }).length;

      // Non-profitable = exact match but not profitable (includes MAYBE, PASS, missing price)
      const nonProfitableASINs = asinsFound - profitableASINs;

      // UPC not on Amazon = valid UPC sent but no exact barcode match returned.
      // Includes POSSIBLE_MATCH (search link only) since those also have no confirmed ASIN.
      const upcNotOnAmazon = brandResults.filter(r =>
        r.decision === 'NO_MATCH' || r.decision === 'POSSIBLE_MATCH'
      ).length;

      // Possible matches = rows with an Amazon search link (no confirmed ASIN)
      const possibleMatches = brandResults.filter(r => r.decision === 'POSSIBLE_MATCH').length;

      // UPC not in Supplier = rows where supplier CSV had no UPC value
      const upcNotInSupplier = brandMissing.length;

      return { brand, asinsFound, profitableASINs, nonProfitableASINs, upcNotOnAmazon, possibleMatches, upcNotInSupplier };
    });
  }, [results, missingUPCRows, fileName, settings.minROI, packCounts]);

  // ── Copy Brand Insider Summary to clipboard ──────────────────────────────────
  const [copied, setCopied] = useState(false);
  const handleCopySummary = () => {
    if (!brandInsiderSummary.length) return;
    const text = brandInsiderSummary.map(b => [
      `Brand Name: ${b.brand}`,
      `Number of ASINs found: ${b.asinsFound}`,
      `Number of profitable ASINs: ${b.profitableASINs}`,
      `Number of Non profitable ASINs: ${b.nonProfitableASINs}`,
      `Number of UPC not available in Amazon: ${b.upcNotOnAmazon}`,
      `Number of UPC not available in Supplier: ${b.upcNotInSupplier}`,
      `Number of possible similar Amazon products found: ${b.possibleMatches}`,
    ].join('\n')).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Export Brand Insider Summary as CSV ──────────────────────────────────────
  const handleExportBrandSummary = () => {
    if (!brandInsiderSummary.length) return;
    const date = new Date().toISOString().slice(0, 10);
    const rows = brandInsiderSummary.map(b => ({
      'Brand Name':                        b.brand,
      'Number of ASINs found':             b.asinsFound,
      'Number of profitable ASINs':        b.profitableASINs,
      'Number of Non profitable ASINs':    b.nonProfitableASINs,
      'Number of UPC not available in Amazon':               b.upcNotOnAmazon,
      'Number of UPC not available in Supplier':             b.upcNotInSupplier,
      'Number of possible similar Amazon products found':    b.possibleMatches,
      'Scan Date':        date,
      'Source File Name': fileName,
    }));
    const csv  = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `brand-insider-summary-${date}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  // ── Table header helper ──────────────────────────────────────────────────────
  const thS = {
    padding: '10px 12px', fontFamily: FONT, fontSize: 10, color: '#475569',
    fontWeight: 600, textAlign: 'left', borderBottom: `1px solid ${BORDER}`,
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  };
  const tdS = {
    padding: '10px 12px', color: '#94a3b8', verticalAlign: 'middle',
    fontFamily: FONT, fontSize: 11, borderBottom: `1px solid rgba(255,255,255,0.03)`,
  };

  const Th = ({ k, label }) => (
    <th style={thS} onClick={k ? () => toggleSort(k) : undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {k && sortKey === k && (sortDir === 'desc' ? <ChevronDown size={10}/> : <ChevronUp size={10}/>)}
      </span>
    </th>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes upc-spin { to { transform: rotate(360deg); } }
        .upc-table-scroll { overflow: auto; }
        .upc-table-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .upc-table-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        .upc-table-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 4px; }
        .upc-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
        .upc-table-scroll::-webkit-scrollbar-corner { background: transparent; }
      `}</style>

      {/* ── Module header ── */}
      <div style={{
        padding: '14px 28px', borderBottom: `1px solid ${BORDER}`,
        background: 'rgba(8,12,18,0.85)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🏷️</span>
            <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.02em' }}>
              UPC Scanner
            </span>
            <span style={{
              fontFamily: FONT, fontSize: 10, color: ORANGE, background: `${ORANGE}15`,
              border: `1px solid ${ORANGE}30`, borderRadius: 5, padding: '2px 8px', fontWeight: 600,
            }}>
              Keepa · Version 1
            </span>
          </div>
          <div style={{ fontFamily: FONT, fontSize: 11, color: '#334155', marginTop: 4 }}>
            Required: <span style={{ color: ORANGE }}>UPC</span> · Recommended: <span style={{ color: '#64748b' }}>Price</span>, <span style={{ color: '#64748b' }}>Product Description</span> · Optional: Brand Name · Fees are estimates
          </div>
        </div>
        {/* No per-tab buttons in header — actions live in each tab */}
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', borderBottom: `1px solid ${BORDER}`,
        background: 'rgba(8,12,18,0.92)', backdropFilter: 'blur(8px)', padding: '0 28px',
      }}>
        {[
          { id: 'upload',  label: 'Upload & Scan', badge: null },
          { id: 'summary', label: 'Brand Summary',
            badge: brandInsiderSummary.length > 0 ? brandInsiderSummary.length : null },
          { id: 'review',  label: 'ASIN Review',
            badge: results.length > 0 ? results.length : null },
          { id: 'history', label: 'Scan History',
            badge: scanHistory.length > 0 ? scanHistory.length : null },
        ].map(({ id, label, badge }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${activeTab === id ? ORANGE : 'transparent'}`,
            padding: '11px 18px 10px', cursor: 'pointer',
            color: activeTab === id ? ORANGE : '#475569',
            fontFamily: FONT, fontSize: 12,
            fontWeight: activeTab === id ? 700 : 400,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap',
          }}>
            {label}
            {badge != null && (
              <span style={{
                background: activeTab === id ? `${ORANGE}18` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${activeTab === id ? `${ORANGE}35` : BORDER}`,
                borderRadius: 10, padding: '1px 7px', fontSize: 10,
                color: activeTab === id ? ORANGE : '#334155', fontWeight: 600,
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content area ── */}
      {/* display: none/flex used instead of conditional rendering so state is    */}
      {/* preserved on inactive tabs (filters, scroll position, etc.)             */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ══ TAB 1: Upload & Scan ══════════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'upload' ? 'flex' : 'none',
          flexDirection: 'column', height: '100%',
          overflowY: 'auto', padding: '20px 28px', gap: 16,
        }}>

        {/* Tab 1 toolbar row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btn(showSettings ? 'active' : 'default')} onClick={() => setShowSettings(s => !s)}>
            <Settings size={13}/> Scan Settings
          </button>
        </div>

        {/* Scan settings panel */}
        {showSettings && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, backdropFilter: 'blur(8px)' }}>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>
              Profit &amp; Scan Settings
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              {[
                { key: 'prepCost',    label: 'Prep Cost / Unit ($)' },
                { key: 'shipCost',    label: 'Inbound Shipping / Unit ($)' },
                { key: 'miscBuffer',  label: 'Misc Buffer / Unit ($)' },
                { key: 'fallbackFBA', label: 'Fallback FBA Fee ($)' },
                { key: 'referralPct', label: 'Referral Fee % (default 15)' },
                { key: 'awlPct',      label: 'AWL Fee % (default 10)' },
                { key: 'taxRate',     label: 'Tax / VAT % (default 0)' },
                { key: 'minROI',      label: 'Min Target ROI %' },
                { key: 'minProfit',   label: 'Min Target Profit ($)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: '#475569', marginBottom: 5 }}>{label}</div>
                  <input type="number" min={0} step={0.01} value={settings[key]}
                    onChange={e => setSettings(s => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputBare, width: '100%' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 10, color: '#334155' }}>
              Referral fee is an estimate based on the % above, not official Amazon category rates.
            </div>
          </div>
        )}

        {/* CSV upload or file info */}
        {!rawRows.length ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              background: dragging ? `${ORANGE}06` : CARD,
              border: `2px dashed ${dragging ? ORANGE : BORDER}`,
              borderRadius: 16, padding: '52px 32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
              transition: 'all 0.2s', backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 18, background: `${ORANGE}10`, border: `1px solid ${ORANGE}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              🏷️
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 }}>
                Upload Supplier CSV
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: '#475569', lineHeight: 1.9 }}>
                <span style={{ color: RED, fontWeight: 600 }}>Required: </span>
                <span style={{ color: ORANGE }}>UPC</span>
                <br />
                <span style={{ color: G, fontWeight: 600 }}>Recommended: </span>
                <span style={{ color: '#94a3b8' }}>Price</span>
                {' · '}
                <span style={{ color: '#94a3b8' }}>Product Description</span>
                <br />
                <span style={{ color: '#475569', fontWeight: 600 }}>Optional: </span>
                <span style={{ color: '#475569' }}>Brand Name</span>
                <br />
                <span style={{ color: '#334155', fontSize: 11 }}>
                  Column names are auto-detected. Add Price for profit/ROI. Add Description for similar-product search.
                </span>
              </div>
            </div>
            <label style={{ ...btn('orange'), fontSize: 13, padding: '10px 24px', cursor: 'pointer' }}>
              <Upload size={14}/> Choose Supplier CSV
              <input type="file" accept=".csv" onChange={handleFileInput} style={{ display: 'none' }}/>
            </label>
            {csvErr && (
              <div style={{ color: RED, fontFamily: FONT, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13}/> {csvErr}
              </div>
            )}
          </div>
        ) : (
          /* File loaded panel */
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, backdropFilter: 'blur(8px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color={G}/>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{fileName}</div>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: '#475569', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    <span>{rawRows.length} rows</span>
                    <span>UPC → <span style={{ color: ORANGE }}>{colMap.upc || '—'}</span></span>
                    <span>Price → <span style={{ color: colMap.price ? G : ORANGE }}>{colMap.price || 'not mapped'}</span></span>
                    <span>Desc → <span style={{ color: colMap.desc ? G : ORANGE }}>{colMap.desc || 'not mapped'}</span></span>
                    {colMap.brand && <span>Brand → <span style={{ color: '#64748b' }}>{colMap.brand}</span></span>}
                  </div>
                  {/* Advisory warnings for missing recommended columns */}
                  {(!colMap.price || !colMap.desc) && (
                    <div style={{ fontFamily: FONT, fontSize: 10, color: ORANGE, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!colMap.price && <span>⚠ No Price column — profit/ROI will not be calculated</span>}
                      {!colMap.desc  && <span>⚠ No Description column — similar-product search disabled</span>}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn('default')} onClick={() => setShowMapper(s => !s)}>
                  <Filter size={13}/> Map Columns
                </button>
                <label style={{ ...btn('default'), cursor: 'pointer' }}>
                  <Upload size={13}/> Replace File
                  <input type="file" accept=".csv" onChange={handleFileInput} style={{ display: 'none' }}/>
                </label>
                <button style={btn('red')} onClick={() => { setRawRows([]); setResults([]); setScanStatus('idle'); setFileName(''); setCsvErr(''); setScanErr(''); }}>
                  <X size={13}/> Clear
                </button>
              </div>
            </div>

            {csvErr && (
              <div style={{ marginTop: 12, color: ORANGE, fontFamily: FONT, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13}/> {csvErr}
              </div>
            )}

            {/* Manual column mapper */}
            {showMapper && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontFamily: FONT, fontSize: 11, color: '#475569', marginBottom: 14 }}>
                  Map CSV columns to scanner fields:
                </div>
                {/* Required */}
                <div style={{ fontFamily: FONT, fontSize: 9, color: RED, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Required</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[{ field: 'upc', label: 'UPC Column' }].map(({ field, label }) => (
                    <div key={field} style={{ flex: '1 1 180px' }}>
                      <div style={{ fontFamily: FONT, fontSize: 10, color: '#94a3b8', marginBottom: 5 }}>{label}</div>
                      <select value={colMap[field] || ''} onChange={e => setColMap(m => ({ ...m, [field]: e.target.value || null }))} style={{ ...inputBare, width: '100%', borderColor: !colMap[field] ? `${RED}60` : BORDER }}>
                        <option value="">— Select —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {/* Recommended */}
                <div style={{ fontFamily: FONT, fontSize: 9, color: G, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Recommended</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[
                    { field: 'price', label: 'Price Column',       hint: 'Required for profit/ROI calculations' },
                    { field: 'desc',  label: 'Description Column', hint: 'Required for similar-product search'  },
                  ].map(({ field, label, hint }) => (
                    <div key={field} style={{ flex: '1 1 180px' }}>
                      <div style={{ fontFamily: FONT, fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: FONT, fontSize: 9, color: '#334155', marginBottom: 5 }}>{hint}</div>
                      <select value={colMap[field] || ''} onChange={e => setColMap(m => ({ ...m, [field]: e.target.value || null }))} style={{ ...inputBare, width: '100%' }}>
                        <option value="">— None (limited results) —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {/* Optional */}
                <div style={{ fontFamily: FONT, fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Optional</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[{ field: 'brand', label: 'Brand Name Column', hint: 'Groups results in Brand Insider Summary. Uses file name if not mapped.' }].map(({ field, label, hint }) => (
                    <div key={field} style={{ flex: '1 1 180px' }}>
                      <div style={{ fontFamily: FONT, fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontFamily: FONT, fontSize: 9, color: '#334155', marginBottom: 5 }}>{hint}</div>
                      <select value={colMap[field] || ''} onChange={e => setColMap(m => ({ ...m, [field]: e.target.value || null }))} style={{ ...inputBare, width: '100%' }}>
                        <option value="">— None (use file name) —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Duplicate / overlap banner */}
        {dupeBannerInfo && (
          <div style={{ background: `${PURPLE}12`, border: `1px solid ${PURPLE}40`, borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <AlertTriangle size={14} color={PURPLE}/>
            <span style={{ fontFamily: FONT, fontSize: 12, color: PURPLE }}>
              <strong>{dupeBannerInfo.overlapPct}%</strong> of UPCs in this file ({dupeBannerInfo.cachedCount}/{dupeBannerInfo.total}) are already cached.
              Save Keepa tokens by using cached data.
            </span>
            <button style={btn('default')} onClick={() => setRescanMode('cache')}>
              Use Cache (default)
            </button>
            <button style={btn('default')} onClick={() => setRescanMode('missing')}>
              Scan New Only
            </button>
            <button style={btn('red')} onClick={() => setRescanMode('all')}>
              Rescan All
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0 }}
              onClick={() => setDupeBannerInfo(null)}><X size={13}/></button>
          </div>
        )}

        {/* Scan controls */}
        {rawRows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {scanStatus !== 'scanning' ? (
              <button style={{ ...btn('orange'), fontSize: 13, padding: '10px 28px' }} onClick={startScan}>
                <Search size={14}/> {rescanMode === 'cache' ? 'Start Scan' : rescanMode === 'all' ? 'Rescan All' : 'Scan New UPCs'}
              </button>
            ) : (
              <button style={{ ...btn('red'), fontSize: 13, padding: '10px 28px' }} onClick={stopScan}>
                <X size={14}/> Stop Scan
              </button>
            )}
            {/* Rescan mode selector */}
            {scanStatus !== 'scanning' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: FONT, fontSize: 10, color: '#475569' }}>Mode:</span>
                {[['cache','Use Cache'],['missing','New Only'],['all','Rescan All']].map(([m, label]) => (
                  <button key={m} style={rescanMode === m ? btn('active') : btn('default')}
                    onClick={() => setRescanMode(m)}>{label}</button>
                ))}
              </div>
            )}

            {scanStatus === 'scanning' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 11, color: '#475569' }}>
                <span style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${ORANGE}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'upc-spin 0.8s linear infinite' }}/>
                Scanning {progress.scanned}/{progress.total} · {progress.matched} matched · {progress.noMatch} no match · {progress.errors} errors
              </div>
            )}
            {scanStatus === 'done' && (
              <div style={{ fontFamily: FONT, fontSize: 11, color: G, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={13}/> Scan complete — {progress.scanned} processed
              </div>
            )}
            {scanErr && (
              <div style={{ fontFamily: FONT, fontSize: 11, color: RED, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13}/> {scanErr}
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        {scanStatus === 'scanning' && progress.total > 0 && (
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(progress.scanned / progress.total) * 100}%`, background: ORANGE, borderRadius: 2, transition: 'width 0.3s' }}/>
          </div>
        )}

        {/* Summary cards */}
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Card label="Total Products"     value={summary.total}                      />
            <Card label="Matched ASINs"      value={summary.matched}       color={B}    />
            <Card label="Good Leads"         value={summary.good}          color={G}    />
            <Card label="Maybe"              value={summary.maybe}         color={ORANGE}/>
            <Card label="Pass"               value={summary.pass}          color={RED}  />
            <Card label="Possible Match"     value={summary.possibleMatch} color={PURPLE} sub="search link only"/>
            <Card label="No Match"           value={summary.noMatch}       color="#475569"/>
            <Card label="Est. Profit (Good)" value={fmtM(summary.goodProfit)} color={G} sub="sum of good leads"/>
          </div>
        )}

        {/* Scan-complete prompt + rescan actions */}
        {scanStatus === 'done' && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontSize: 12, color: '#475569', flexWrap: 'wrap' }}>
              <CheckCircle size={14} color={G}/>
              <span>Scan complete. View results in</span>
              <button style={{ ...btn('orange'), padding: '5px 12px' }} onClick={() => setActiveTab('summary')}>Brand Summary</button>
              <span>or</span>
              <button style={{ ...btn('default'), padding: '5px 12px' }} onClick={() => setActiveTab('review')}>ASIN Review</button>
              {savingSession && <span style={{ color: '#475569', fontSize: 11 }}>Saving session…</span>}
              {savedSessionId && !savingSession && <span style={{ color: G, fontSize: 11 }}><CheckCircle size={11}/> Session saved</span>}
            </div>
            {/* Rescan action buttons */}
            {rawRows.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: FONT, fontSize: 10, color: '#475569' }}>Rescan:</span>
                <button style={btn('default')} onClick={handleRescanAll}>
                  <RefreshCw size={12}/> All UPCs
                </button>
                <button style={btn('default')} onClick={handleRescanMissing}>
                  <RefreshCw size={12}/> Missing Only
                </button>
                {selectedRows.size > 0 && (
                  <button style={btn('blue')} onClick={handleRescanSelected}>
                    <RefreshCw size={12}/> Selected ({selectedRows.size})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        </div>{/* end Tab 1: Upload & Scan */}

        {/* ══ TAB 2: Brand Summary ═════════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'summary' ? 'flex' : 'none',
          flexDirection: 'column', height: '100%',
          overflowY: 'auto', padding: '20px 28px', gap: 16,
        }}>

          {viewingSession && (
            <div style={{ background: `${B}10`, border: `1px solid ${B}30`, borderRadius: 8, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <FolderOpen size={12} color={B}/>
              <span style={{ fontFamily: FONT, fontSize: 11, color: B, fontWeight: 600 }}>
                Viewing saved scan: <strong>{viewingSession.brand_name}</strong>
                {' '}— {new Date(viewingSession.scan_date).toLocaleDateString()}
              </span>
              <button style={{ ...btn('default'), marginLeft: 'auto' }} onClick={() => setActiveTab('history')}>
                <History size={11}/> Scan History
              </button>
            </div>
          )}
          {results.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 16, color: '#334155', fontFamily: FONT }}>
              <BarChart2 size={32} color="#334155"/>
              <div style={{ fontSize: 14 }}>No scan results yet.</div>
              <button style={{ ...btn('orange') }} onClick={() => setActiveTab('upload')}>
                ← Go to Upload &amp; Scan
              </button>
            </div>
          ) : (
            <>
              {/* Brand Insider Summary — full width, not capped */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '22px 24px', backdropFilter: 'blur(8px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BarChart2 size={16} color={ORANGE}/>
                    <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                      Brand Insider Summary
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 10, color: '#334155' }}>
                      · Only exact UPC-validated ASINs counted
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn('default')} onClick={handleCopySummary}>
                      <Copy size={13}/> {copied ? '✓ Copied!' : 'Copy Summary'}
                    </button>
                    <button style={btn('orange')} onClick={handleExportBrandSummary}>
                      <Download size={13}/> Export Brand Insider CSV
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {brandInsiderSummary.map(b => (
                    <div key={b.brand} style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${BORDER}`,
                      borderLeft: `3px solid ${ORANGE}`,
                      borderRadius: 10, padding: '18px 22px',
                    }}>
                      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>
                        {b.brand}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {[
                          { label: 'Number of ASINs found',                              value: b.asinsFound,         color: b.asinsFound > 0 ? B : '#475569'           },
                          { label: 'Number of profitable ASINs',                         value: b.profitableASINs,    color: b.profitableASINs > 0 ? G : '#475569'       },
                          { label: 'Number of Non profitable ASINs',                     value: b.nonProfitableASINs, color: b.nonProfitableASINs > 0 ? ORANGE : '#475569'},
                          { label: 'Number of UPC not available in Amazon',              value: b.upcNotOnAmazon,     color: b.upcNotOnAmazon > 0 ? RED : '#475569'       },
                          { label: 'Number of UPC not available in Supplier',            value: b.upcNotInSupplier,   color: '#475569'                                    },
                          { label: 'Number of possible similar Amazon products found',   value: b.possibleMatches,    color: b.possibleMatches > 0 ? PURPLE : '#475569'   },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span style={{ fontFamily: FONT, fontSize: 13, color: '#64748b', minWidth: 340 }}>{label}:</span>
                            <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, fontFamily: FONT, fontSize: 10, color: '#334155', lineHeight: 1.8 }}>
                  Profitable = exact UPC match + profit &gt; 0 + ROI ≥ {settings.minROI}% (current setting) ·
                  Non-Profitable = exact match but below threshold ·
                  Not on Amazon = valid UPC sent, no exact barcode match returned (includes Possible Matches) ·
                  Not in Supplier = blank or invalid UPC in CSV ·
                  Possible Similar = no exact UPC match, but Amazon search link generated from product description
                </div>
              </div>

              <button style={{ ...btn('default'), alignSelf: 'flex-start' }} onClick={() => setActiveTab('review')}>
                View detailed ASIN results →
              </button>
            </>
          )}
        </div>{/* end Tab 2: Brand Summary */}

        {/* ══ TAB 3: ASIN Review ═══════════════════════════════════════════════ */}
        {/* overflow: hidden + flex column so the table card can fill flex: 1     */}
        <div style={{
          display: activeTab === 'review' ? 'flex' : 'none',
          flexDirection: 'column', height: '100%', overflow: 'hidden',
          padding: '12px 28px 24px',
        }}>

          {sessionLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 12, color: '#475569', fontFamily: FONT }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${B}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'upc-spin 0.8s linear infinite' }}/>
              <div style={{ fontSize: 13 }}>Loading saved scan…</div>
            </div>
          ) : sessionLoadError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 12, color: RED, fontFamily: FONT }}>
              <AlertCircle size={28}/>
              <div style={{ fontSize: 13 }}>{sessionLoadError}</div>
              <button style={btn('default')} onClick={() => { setActiveTab('history'); setSessionLoadError(''); }}>
                ← Back to Scan History
              </button>
            </div>
          ) : results.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 16, color: '#334155', fontFamily: FONT }}>
              <div style={{ fontSize: 14 }}>No scan results yet.</div>
              <button style={{ ...btn('orange') }} onClick={() => setActiveTab('upload')}>
                ← Go to Upload &amp; Scan
              </button>
            </div>
          ) : (
            /* Results table card — fills ALL remaining tab height */
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 14, backdropFilter: 'blur(8px)' }}>

            {/* Viewing saved scan banner */}
            {viewingSession && (
              <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: `1px solid ${BORDER}`,
                background: `${B}10`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <FolderOpen size={13} color={B}/>
                <span style={{ fontFamily: FONT, fontSize: 11, color: B, fontWeight: 600 }}>
                  Viewing saved scan: <strong>{viewingSession.brand_name}</strong>
                  {' '}— {new Date(viewingSession.scan_date).toLocaleDateString()}
                  {viewingSession.source_file_name && <span style={{ color: '#475569' }}> · {viewingSession.source_file_name}</span>}
                </span>
                {sessionLoading && <span style={{ fontFamily: FONT, fontSize: 10, color: '#475569' }}>Loading saved scan…</span>}
                {sessionLoadError && <span style={{ fontFamily: FONT, fontSize: 10, color: RED }}>{sessionLoadError}</span>}
                <button style={{ ...btn('default'), marginLeft: 'auto' }} onClick={() => {
                  setViewingSession(null);
                  setResults([]);
                  setScanStatus('idle');
                  setActiveTab('history');
                }}>
                  <ArrowLeft size={12}/> Back to Scan History
                </button>
              </div>
            )}

          {/* Table toolbar — fixed at top of Zone 2 */}
            <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              background: 'rgba(8,12,18,0.7)', borderRadius: viewingSession ? 0 : '14px 14px 0 0' }}>

              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginRight: 4 }}>
                Results
              </div>
              <span style={{ fontFamily: FONT, fontSize: 11, color: '#334155' }}>({filtered.length} shown)</span>

              {/* Decision filter chips */}
              {[['ALL','All'], ['GOOD','Good'], ['MAYBE','Maybe'], ['PASS','Pass'], ['POSSIBLE_MATCH','Possible Match'], ['NO_MATCH','No Match']].map(([v, label]) => (
                <button key={v}
                  style={decFilter === v ? btn('active') : btn('default')}
                  onClick={() => setDecFilter(v)}>
                  {label}
                  {v !== 'ALL' && <span style={{ opacity: 0.6, fontSize: 10 }}>({results.filter(r => r.decision === v).length})</span>}
                </button>
              ))}

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={btn('default')} onClick={handleExport}>
                  <Download size={13}/> Export Full CSV
                </button>
                <button style={btn('green')} onClick={handleExportXLSX}>
                  <Download size={13}/> Brand Insider XLSX
                </button>
                <span style={{ fontFamily: FONT, fontSize: 10, color: '#475569' }}>Min ROI%</span>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="number" value={minROIFilter} onChange={e => setMinROIFilter(e.target.value)}
                    placeholder="—" style={{ ...inputBare, width: 64, paddingRight: minROIFilter !== '' ? 22 : 12 }}/>
                  {minROIFilter !== '' && (
                    <button onClick={() => setMinROIFilter('')}
                      style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0, display: 'flex' }}>
                      <X size={11}/>
                    </button>
                  )}
                </div>
                <span style={{ fontFamily: FONT, fontSize: 10, color: '#475569' }}>Min Profit$</span>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="number" value={minProfitFilter} onChange={e => setMinProfitFilter(e.target.value)}
                    placeholder="—" style={{ ...inputBare, width: 64, paddingRight: minProfitFilter !== '' ? 22 : 12 }}/>
                  {minProfitFilter !== '' && (
                    <button onClick={() => setMinProfitFilter('')}
                      style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0, display: 'flex' }}>
                      <X size={11}/>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Scroll hint */}
            <div style={{ flexShrink: 0, padding: '4px 16px', fontFamily: FONT, fontSize: 10,
              color: '#1e293b', borderBottom: `1px solid ${BORDER}`, letterSpacing: '0.04em' }}>
              ← Scroll sideways to view more columns · Scroll down to see all rows →
            </div>

            {/* Table scroll area — THIS is the only true scroll container.         */}
            {/* Both overflow axes are explicitly set to auto. No parent overflow    */}
            {/* constraints interfere. flex: 1 fills all remaining Zone 2 height.   */}
            <div className="upc-table-scroll" style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ minWidth: 1500, borderCollapse: 'collapse', width: 'max-content' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 3,
                  background: 'rgba(8,12,22,0.97)', backdropFilter: 'blur(8px)' }}>
                  <tr>
                    <Th k={null}     label="☑"           />
                    <Th k="decision" label="Decision"    />
                    <Th k={null}     label="Cache"       />
                    <Th k={null}     label="Image"       />
                    <Th k={null}     label="UPC"         />
                    <Th k={null}     label="Description" />
                    <Th k="price"    label="Supplier Unit $" />
                    <Th k={null}     label="Pack Count"     />
                    <Th k={null}     label="Total Cost"     />
                    <Th k={null}     label="ASIN"           />
                    <Th k={null}     label="Amazon Title"/>
                    <Th k={null}     label="Brand"       />
                    <Th k={null}     label="Category"    />
                    <Th k="buyBox"   label="Buy Box"     />
                    <Th k={null}     label="Calc Price"  />
                    <Th k={null}     label="Price Src"   />
                    <Th k={null}     label="FBA Fee"     />
                    <Th k={null}     label="Ref. Fee"    />
                    <Th k="profit"   label="Est. Profit" />
                    <Th k="roi"      label="ROI %"       />
                    <Th k={null}     label="Margin %"    />
                    <Th k="bsr"      label="BSR"         />
                    <Th k="sellers"  label="Sellers"     />
                    <Th k={null}     label="Amz In Stock"/>
                    <Th k={null}     label="Pkg Weight"  />
                    <Th k={null}     label="Match Type"      />
                    <Th k={null}     label="AWL %"           />
                    <Th k={null}     label="AWL Fee $"        />
                    <Th k={null}     label="Status"           />
                    <Th k={null}     label="BI Notes"         />
                    <Th k={null}     label="PR Member"        />
                    <Th k={null}     label="FBA/FBM"          />
                    <Th k={null}     label="Supplier Link"    />
                    <Th k={null}     label="Notes"            />
                    <Th k={null}     label="Link / Search"    />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const packCount       = packCounts[row.upc] ?? 1;
                    const totalSupplierCost = row.price * packCount;
                    const overridePc      = packCount > 1
                      ? calcProfit(row.calcPrice, totalSupplierCost, row.fbaFee, settings)
                      : row.pc;
                    return (
                    <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      {/* Checkbox for Rescan Selected */}
                      <td style={{ ...tdS, width: 32, textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={selectedRows.has(row.upc)}
                          onChange={e => {
                            setSelectedRows(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(row.upc) : next.delete(row.upc);
                              return next;
                            });
                          }}
                          style={{ cursor: 'pointer', accentColor: ORANGE }}
                        />
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        <DecBadge decision={row.decision}/>
                        {row.scanValidation === 'exact_barcode' && (
                          <span title="Barcode confirmed" style={{ marginLeft: 5, fontSize: 9, color: G, fontFamily: FONT, fontWeight: 700 }}>✓ UPC</span>
                        )}
                        {row.scanValidation === 'positional_unverified' && (
                          <span title="No barcode data in Keepa — matched by position only" style={{ marginLeft: 5, fontSize: 9, color: ORANGE, fontFamily: FONT }}>⚠ verify</span>
                        )}
                      </td>
                      {/* Cache status cell */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        {row.cacheStatus === 'cached' ? (() => {
                          // Show sub-label based on cached match type
                          const mt = row._cachedMatchType || row.matchType || '';
                          const sub = mt === 'Exact UPC' ? '✓ Exact UPC'
                                    : mt === 'Search Link' ? '🔍 Possible Match'
                                    : mt === 'No Match'   ? '— No Match'
                                    : mt === 'Unverified' ? '~ Unverified'
                                    : '';
                          return (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${B}12`, border: `1px solid ${B}35`, borderRadius: 5, padding: '2px 7px', fontSize: 9, color: B, fontWeight: 600 }}>
                                💾 Cached
                              </span>
                              {sub && <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{sub}</div>}
                            </div>
                          );
                        })() : row.cacheStatus === 'rescanned' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${PURPLE}12`, border: `1px solid ${PURPLE}35`, borderRadius: 5, padding: '2px 7px', fontSize: 9, color: PURPLE, fontWeight: 600 }}>
                            🔄 Rescanned
                          </span>
                        ) : row.cacheStatus === 'fresh_scan' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${G}12`, border: `1px solid ${G}35`, borderRadius: 5, padding: '2px 7px', fontSize: 9, color: G, fontWeight: 600 }}>
                            ✨ Fresh
                          </span>
                        ) : null}
                        {row.lastKeepaScannedAt && (
                          <div style={{ marginTop: 2 }}>
                            <CacheAgeBadge lastScannedAt={row.lastKeepaScannedAt}/>
                          </div>
                        )}
                      </td>
                      <td style={tdS}>
                        {row.imgUrl
                          ? <img src={row.imgUrl} alt="" style={{ width: 38, height: 38, objectFit: 'contain', borderRadius: 6, background: '#0f172a' }}/>
                          : <div style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}/>
                        }
                      </td>
                      <td style={{ ...tdS, color: '#e2e8f0', fontSize: 10, whiteSpace: 'nowrap' }}>{row.originalUPC || row.upc}</td>
                      <td style={{ ...tdS, minWidth: 180, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.desc}>{row.desc}</td>
                      <td style={{ ...tdS, color: ORANGE, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtM(row.price)}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        <input
                          type="number" min={1} max={999}
                          value={packCounts[row.upc] ?? 1}
                          onChange={e => setPackCounts(p => ({ ...p, [row.upc]: Math.max(1, parseInt(e.target.value) || 1) }))}
                          style={{ ...inputBare, width: 52, padding: '4px 8px', fontSize: 11 }}
                        />
                        {packCount > 1 && (
                          <div style={{ fontSize: 9, color: ORANGE, marginTop: 2 }}>
                            ×{packCount} = {fmtM(totalSupplierCost)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        <span style={{ color: packCount > 1 ? ORANGE : '#64748b', fontWeight: packCount > 1 ? 600 : 400 }}>
                          {fmtM(totalSupplierCost)}
                        </span>
                        {packCount > 1 && (
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>
                            unit × {packCount}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdS, color: B, fontSize: 10, whiteSpace: 'nowrap' }}>{row.asin || '—'}</td>
                      <td style={{ ...tdS, minWidth: 180, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title || ''}>{row.title || '—'}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{row.brand || '—'}</td>
                      <td style={{ ...tdS, minWidth: 100, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.category || '—'}</td>
                      {/* Buy Box: ONLY actual Buy Box price, never a fallback */}
                      <td style={{ ...tdS, color: row.buyBox != null ? '#e2e8f0' : '#334155', fontWeight: row.buyBox != null ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {row.buyBox != null ? fmtM(row.buyBox) : <span style={{ fontSize: 10, color: '#334155' }}>—</span>}
                      </td>
                      {/* Calc Price: the price actually used for profit math */}
                      <td style={{ ...tdS, color: row.calcPrice != null ? ORANGE : '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {row.calcPrice != null ? fmtM(row.calcPrice) : '—'}
                      </td>
                      {/* Price Src: clear label for what was used */}
                      <td style={{ ...tdS, fontSize: 10, whiteSpace: 'nowrap',
                        color: row.calcPriceLabel === 'Missing' ? RED
                             : row.calcPriceLabel === 'Buy Box' ? G
                             : ORANGE }}>
                        {row.calcPriceLabel || '—'}
                      </td>
                      <td style={{ ...tdS, color: row.fbaFee == null ? ORANGE : '#94a3b8', whiteSpace: 'nowrap' }}>
                        {row.fbaFee != null ? fmtM(row.fbaFee) : <span style={{ fontSize: 10, color: ORANGE }}>missing</span>}
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{overridePc ? fmtM(overridePc.referral) : '—'}</td>
                      <td style={{ ...tdS, color: (overridePc?.profit ?? 0) > 0 ? G : (overridePc?.profit ?? 0) < 0 ? RED : '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {overridePc ? fmtM(overridePc.profit) : '—'}
                      </td>
                      <td style={{ ...tdS, color: (overridePc?.roi ?? 0) >= settings.minROI ? G : (overridePc?.roi ?? 0) > 0 ? ORANGE : RED, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {overridePc?.roi != null ? fmtP(overridePc.roi) : '—'}
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{overridePc?.margin != null ? fmtP(overridePc.margin) : '—'}</td>
                      <td style={{ ...tdS, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                        {row.bsr ? fmtBSR(row.bsr) : '—'}
                        {row.bsr && row.bsrLabel && row.bsrLabel !== 'Current BSR' && (
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{row.bsrLabel}</div>
                        )}
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{row.sellers ?? '—'}</td>
                      <td style={{ ...tdS, fontSize: 10, whiteSpace: 'nowrap', color: row.amzInStock ? RED : (row.asin ? G : '#475569') }}>
                        {row.asin ? (row.amzInStock ? 'Yes ⚠' : 'No') : '—'}
                      </td>
                      <td style={{ ...tdS, fontSize: 10, whiteSpace: 'nowrap' }}>{row.pkgWeight || '—'}</td>
                      {/* Match Type column */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap', fontSize: 10 }}>
                        {row.matchType === 'Exact UPC' && (
                          <span style={{ color: G, fontWeight: 600 }}>✓ Exact UPC</span>
                        )}
                        {row.matchType === 'Unverified' && (
                          <span style={{ color: ORANGE }}>~ Unverified</span>
                        )}
                        {row.matchType === 'Search Link' && (
                          <span style={{ color: PURPLE }}>🔍 Search Link</span>
                        )}
                        {row.matchType === 'No Match' && (
                          <span style={{ color: '#475569' }}>— No Match</span>
                        )}
                      </td>
                      {/* AWL Fee % */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap', fontSize: 10, color: '#64748b' }}>
                        {settings.awlPct ?? 10}%
                      </td>
                      {/* AWL Fee $ */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap', color: ORANGE }}>
                        {overridePc?.awlFee != null ? fmtM(overridePc.awlFee) : (row.calcPrice != null ? fmtM(row.calcPrice * ((settings.awlPct ?? 10) / 100)) : '—')}
                      </td>
                      {/* Status pill dropdown */}
                      {(() => {
                        const status = rowStatus[row.upc] || '';
                        const statusColor = status === 'Approved' ? G : status === 'Denied' ? RED : ORANGE;
                        return (
                          <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                            <select
                              value={status}
                              onChange={e => setRowStatus(prev => ({ ...prev, [row.upc]: e.target.value }))}
                              style={{
                                background: status ? `${statusColor}15` : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${status ? statusColor + '50' : BORDER}`,
                                borderRadius: 6, padding: '3px 8px', color: status ? statusColor : '#475569',
                                fontFamily: FONT, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                outline: 'none',
                              }}
                            >
                              <option value="">— Select —</option>
                              <option value="Potential">Potential</option>
                              <option value="Approved">Approved</option>
                              <option value="Denied">Denied</option>
                            </select>
                          </td>
                        );
                      })()}
                      {/* Brand Insider Notes */}
                      <td style={{ ...tdS, minWidth: 160, maxWidth: 200 }}>
                        <input
                          type="text"
                          value={rowNotes[row.upc] || ''}
                          placeholder="Add notes…"
                          onChange={e => setRowNotes(prev => ({ ...prev, [row.upc]: e.target.value }))}
                          style={{ ...inputBare, width: '100%', fontSize: 11, padding: '4px 8px' }}
                        />
                      </td>
                      {/* PR Member */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        <input
                          type="text"
                          value={rowPRMember[row.upc] || ''}
                          placeholder="Name…"
                          onChange={e => setRowPRMember(prev => ({ ...prev, [row.upc]: e.target.value }))}
                          style={{ ...inputBare, width: 80, fontSize: 11, padding: '4px 8px' }}
                        />
                      </td>
                      {/* FBA/FBM */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        <select
                          value={rowFbaFbm[row.upc] || (row.asin ? 'FBA' : 'Unknown')}
                          onChange={e => setRowFbaFbm(prev => ({ ...prev, [row.upc]: e.target.value }))}
                          style={{ ...inputBare, fontSize: 11, padding: '3px 6px', cursor: 'pointer' }}
                        >
                          <option value="FBA">FBA</option>
                          <option value="FBM">FBM</option>
                          <option value="FBA/FBM">FBA/FBM</option>
                          <option value="Unknown">Unknown</option>
                        </select>
                      </td>
                      {/* Supplier Link/UPC/Item Code */}
                      <td style={{ ...tdS, minWidth: 120, maxWidth: 160 }}>
                        <input
                          type="text"
                          value={rowSupplierLink[row.upc] || row.originalUPC || row.upc || ''}
                          onChange={e => setRowSupplierLink(prev => ({ ...prev, [row.upc]: e.target.value }))}
                          style={{ ...inputBare, width: '100%', fontSize: 10, padding: '4px 8px' }}
                        />
                      </td>
                      {/* Notes column */}
                      {(() => {
                        const packNote = packCount > 1 ? 'Supplier unit price multiplied by manual pack count.' : '';
                        const fullNotes = [row.notes, packNote].filter(Boolean).join(' ');
                        return (
                          <td style={{ ...tdS, minWidth: 160, maxWidth: 240, fontSize: 10, color: ORANGE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fullNotes}>{fullNotes}</td>
                        );
                      })()}
                      {/* Link / Search column */}
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        {/* Exact Amazon product URL */}
                        {row.amazonUrl && (
                          <a href={row.amazonUrl} target="_blank" rel="noreferrer"
                            title="Open Amazon product page"
                            style={{ color: B, display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6 }}>
                            <ExternalLink size={12}/>
                          </a>
                        )}
                        {/* Search Similar link for Possible Match rows */}
                        {row.amazonSearchUrl && (
                          <a href={row.amazonSearchUrl} target="_blank" rel="noreferrer"
                            title="Search Amazon by product description"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: `${PURPLE}18`, border: `1px solid ${PURPLE}40`,
                              borderRadius: 5, padding: '2px 8px',
                              color: PURPLE, fontSize: 10, fontFamily: FONT, fontWeight: 600,
                              textDecoration: 'none', whiteSpace: 'nowrap',
                            }}>
                            🔍 Search Similar
                          </a>
                        )}
                      </td>
                    </tr>
                  ); })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={35} style={{ ...tdS, textAlign: 'center', padding: '48px', color: '#334155' }}>
                        No results match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}

        </div>{/* end Tab 3: ASIN Review */}

        {/* ══ TAB 4: Scan History ══════════════════════════════════════════════ */}
        <div style={{
          display: activeTab === 'history' ? 'flex' : 'none',
          flexDirection: 'column', height: '100%',
          overflowY: 'auto', padding: '20px 28px', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={16} color={ORANGE}/>
              <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Scan History</span>
              {!hasSupabase && (
                <span style={{ fontFamily: FONT, fontSize: 10, color: RED }}>Supabase not connected — history unavailable</span>
              )}
            </div>
            <button style={btn('default')} onClick={async () => {
              setHistoryLoading(true);
              const rows = await loadScanSessions();
              setScanHistory(rows);
              setHistoryLoading(false);
            }}>
              <RefreshCw size={12}/> Refresh
            </button>
          </div>

          {historyLoading ? (
            <div style={{ fontFamily: FONT, fontSize: 12, color: '#475569' }}>Loading history…</div>
          ) : !scanHistory.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: 12, color: '#334155', fontFamily: FONT }}>
              <History size={32} color="#334155"/>
              <div style={{ fontSize: 13 }}>No saved scan sessions yet.</div>
              <div style={{ fontSize: 11, color: '#1e293b' }}>After each scan, a session summary is automatically saved here.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scanHistory.map(session => {
                const ageDays = Math.floor((Date.now() - new Date(session.scan_date).getTime()) / (1000*60*60*24));
                const isOld = ageDays > 30;
                return (
                  <div key={session.id} style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderLeft: `3px solid ${ORANGE}`,
                    borderRadius: 10, padding: '16px 20px',
                    backdropFilter: 'blur(8px)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                          {session.brand_name}
                        </div>
                        <div style={{ fontFamily: FONT, fontSize: 10, color: '#475569', marginBottom: 8 }}>
                          {session.source_file_name && <span>{session.source_file_name} · </span>}
                          {new Date(session.scan_date).toLocaleDateString()} · {ageDays}d ago
                          {session.created_by && <span> · by {session.created_by}</span>}
                        </div>
                        {isOld && (
                          <div style={{ fontFamily: FONT, fontSize: 10, color: ORANGE, marginBottom: 8 }}>
                            ⚠ Saved data may be outdated. Consider refreshing.
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                          {[
                            { label: 'Total',      value: session.total_products,           color: '#e2e8f0' },
                            { label: 'ASINs Found', value: session.asins_found,             color: B         },
                            { label: 'Profitable', value: session.profitable_asins,          color: G         },
                            { label: 'Not on Amz', value: session.upc_not_available_amazon, color: RED       },
                            { label: 'No UPC',     value: session.upcs_missing_supplier,    color: '#475569' },
                            { label: 'Possible',   value: session.possible_matches,         color: PURPLE    },
                          ].map(({ label, value, color }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                              <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color }}>{value ?? 0}</div>
                              <div style={{ fontFamily: FONT, fontSize: 9, color: '#334155' }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
                        <button style={btn('blue')} onClick={() => openSavedScan(session)}
                          disabled={sessionLoading}>
                          <FolderOpen size={12}/>
                          {sessionLoading && viewingSession?.id === session.id ? 'Loading…' : 'Open'}
                        </button>
                        <button style={btn('red')} onClick={async e => {
                          e.stopPropagation();
                          if (!confirm(`Delete saved scan for "${session.brand_name}"? This cannot be undone.`)) return;
                          const ok = await deleteScanSession(session.id);
                          if (ok) {
                            setScanHistory(prev => prev.filter(s => s.id !== session.id));
                            if (viewingSession?.id === session.id) {
                              setViewingSession(null);
                              setResults([]);
                              setScanStatus('idle');
                            }
                          }
                        }}>
                          <Trash2 size={12}/> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>{/* end Tab 4: Scan History */}

      </div>{/* end tab content area */}
    </div>
  );
}
