import { DEFAULT_KPI } from './scoring.js';

const KPI_KEY       = 'fulfld_kpi_v2';     // v2 to bust any corrupted v1 data
const DUPE_KEY      = 'fulfld_dupes_v1';
const USER_KEY      = 'fulfld_user_v1';
const PIPELINE_KEY  = 'fulfld_pipeline_v1';

// ── KPI validation ────────────────────────────────────────────────────────────
function isValidKPI(s) {
  if (!s || typeof s !== 'object') return false;
  const w = s.weights;
  return (
    w && typeof w === 'object' &&
    Number.isFinite(w.revenue) &&
    Number.isFinite(w.sellers) &&
    Number.isFinite(w.amazonPct) &&
    Number.isFinite(w.growth) &&
    Number.isFinite(w.brandScore) &&
    Number.isFinite(s.minRevenue)
  );
}

// ── KPI ───────────────────────────────────────────────────────────────────────
export function loadKPISettings() {
  try {
    const raw = localStorage.getItem(KPI_KEY);
    if (!raw) return DEFAULT_KPI;
    const parsed = JSON.parse(raw);
    return isValidKPI(parsed) ? parsed : DEFAULT_KPI;
  } catch {
    return DEFAULT_KPI;
  }
}

export function saveKPISettings(v) {
  if (!isValidKPI(v)) return; // never persist invalid structure
  localStorage.setItem(KPI_KEY, JSON.stringify(v));
}

// ── Duplicates ────────────────────────────────────────────────────────────────
export function loadDuplicateList()  { try { return JSON.parse(localStorage.getItem(DUPE_KEY)) ?? []; } catch { return []; } }
export function saveDuplicateList(v) { localStorage.setItem(DUPE_KEY, JSON.stringify(v)); }

// ── User identity ─────────────────────────────────────────────────────────────
export function loadUser()  { return localStorage.getItem(USER_KEY) || null; }
export function saveUser(v) { localStorage.setItem(USER_KEY, v); }

// ── Local pipeline fallback ───────────────────────────────────────────────────
export function loadLocalPipeline()  { try { return JSON.parse(localStorage.getItem(PIPELINE_KEY)) ?? {}; } catch { return {}; } }
export function saveLocalPipeline(v) { localStorage.setItem(PIPELINE_KEY, JSON.stringify(v)); }
