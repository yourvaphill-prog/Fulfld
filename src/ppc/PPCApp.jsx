import React, { useMemo, useState, useEffect } from 'react';
import { T } from './theme.js';
import UploadPanel from './components/UploadPanel.jsx';
import OverviewCards from './components/OverviewCards.jsx';
import CampaignTable from './components/CampaignTable.jsx';
import ProductTable from './components/ProductTable.jsx';
import SearchTermTable from './components/SearchTermTable.jsx';
import RecommendationList from './components/RecommendationList.jsx';
import ActionList from './components/ActionList.jsx';
import TrackedActionList from './components/TrackedActionList.jsx';
import WeeklyReport from './components/WeeklyReport.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import NegativeKeywordBuilder from './components/NegativeKeywordBuilder.jsx';
import WinningKeywordBuilder from './components/WinningKeywordBuilder.jsx';
import ScalingPlan from './components/ScalingPlan.jsx';
import ProductReadiness from './components/ProductReadiness.jsx';
import BossReport from './components/BossReport.jsx';
import ThresholdSettings, { DEFAULT_THRESHOLDS } from './components/ThresholdSettings.jsx';
import { aggregateMetrics } from './utils/metricCalculator.js';
import { generateRecommendations } from './utils/recommendationEngine.js';

const STORAGE_KEY_THRESHOLDS      = 'ppc_thresholds';
const STORAGE_KEY_TAB             = 'ppc_activeTab';
const STORAGE_KEY_HISTORY         = 'ppc_history';
const STORAGE_KEY_TRACKED_ACTIONS = 'ppc_tracked_actions';

const MAX_TRACKED_ACTIONS = 200;

const NAV_ITEMS = [
  { key: 'overview',        label: 'Overview' },
  { key: 'campaigns',       label: 'Campaigns' },
  { key: 'products',        label: 'Products' },
  { key: 'searchTerms',     label: 'Search Terms' },
  { key: 'negatives',       label: 'Neg Keywords' },
  { key: 'winners',         label: 'Win Keywords' },
  { key: 'scaling',         label: 'Scaling Plan' },
  { key: 'readiness',       label: 'Product Readiness' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'actions',         label: 'Action Tracker' },
  { key: 'report',          label: 'Weekly Report' },
  { key: 'bossReport',      label: 'Boss Report' },
  { key: 'history',         label: 'History' },
  { key: 'settings',        label: 'Settings' },
];

// ── localStorage helpers ───────────────────────────────────────────────────────
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
}

function loadThresholds() {
  try {
    const raw = lsGet(STORAGE_KEY_THRESHOLDS);
    return raw ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) } : DEFAULT_THRESHOLDS;
  } catch { return DEFAULT_THRESHOLDS; }
}

function saveThresholds(t) {
  lsSet(STORAGE_KEY_THRESHOLDS, JSON.stringify(t));
}

function genId() {
  try { return crypto.randomUUID(); } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// ── History helpers ────────────────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = lsGet(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ── Tracked-action helpers ─────────────────────────────────────────────────────
function loadTrackedActions() {
  try {
    const raw = lsGet(STORAGE_KEY_TRACKED_ACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistTrackedActions(actions) {
  lsSet(STORAGE_KEY_TRACKED_ACTIONS, JSON.stringify(actions));
}

function makeFingerprint(rec) {
  return `${rec.type}::${rec.entity}::${rec.headline}`;
}

// ── Inline styles ──────────────────────────────────────────────────────────────
const s = {
  // Root: full-height flex column — App.jsx provides the shared background
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: T.font.body,
  },

  // ── Body row (sidebar + main) ──────────────────────────────────────────────
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },

  // ── Main column (nav tabs + tab content) ──────────────────────────────────
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // Glass navigation tab bar
  subNav: {
    display: 'flex',
    gap: 2,
    padding: '0 16px',
    ...T.glass.nav,
    flexShrink: 0,
    overflowX: 'auto',
    // Hide scrollbar but keep scroll
    scrollbarWidth: 'none',
  },

  // Individual nav tab button
  navBtn: {
    padding: '11px 13px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: T.color.dim,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: T.font.body,
    whiteSpace: 'nowrap',
    transition: T.transition.fast,
    letterSpacing: '0.02em',
    position: 'relative',
  },

  // Active nav tab button
  navBtnActive: {
    color: T.color.cyan,
    borderBottom: `2px solid ${T.color.cyan}`,
    textShadow: `0 0 12px rgba(6,182,212,0.4)`,
  },

  // Tab content area
  tabContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px',
  },

  // Section heading
  sectionTitle: {
    color: T.color.white,
    fontWeight: 700,
    fontSize: 17,
    marginBottom: 4,
    fontFamily: T.font.heading,
    letterSpacing: '0.01em',
  },

  sectionSub: {
    color: T.color.dim,
    fontSize: 12,
    marginBottom: 20,
  },

  // No-data banner
  banner: {
    background: 'rgba(6,182,212,0.06)',
    border: '1px solid rgba(6,182,212,0.20)',
    borderRadius: T.radius.sm,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    color: T.color.cyan,
    fontSize: 13,
  },
};

// ── Keyframe style tag injected once ──────────────────────────────────────────
const KEYFRAMES = `
  .ppc-subnav::-webkit-scrollbar { display: none; }
`;

function injectKeyframes() {
  if (document.getElementById('ppc-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'ppc-keyframes';
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PPCApp({ onSwitchModule }) {
  const [uploads,        setUploads]        = useState([]);
  const [activeTab,      setActiveTab]      = useState(() => lsGet(STORAGE_KEY_TAB) || 'overview');
  const [thresholds,     setThresholds]     = useState(loadThresholds);
  const [history,        setHistory]        = useState(loadHistory);
  const [trackedActions, setTrackedActions] = useState(loadTrackedActions);
  // Inject keyframes on mount
  useEffect(() => { injectKeyframes(); }, []);

  useEffect(() => { lsSet(STORAGE_KEY_TAB, activeTab); }, [activeTab]);
  useEffect(() => { saveThresholds(thresholds); },        [thresholds]);

  // ── Split uploads by report type ──
  const { campaigns, searchTerms, products, allRows } = useMemo(() => {
    const campaigns = [], searchTerms = [], products = [], allRows = [];
    for (const u of uploads) {
      if (!u.rows) continue;
      allRows.push(...u.rows);
      if (u.reportType === 'campaign')        campaigns.push(...u.rows);
      else if (u.reportType === 'searchTerm') searchTerms.push(...u.rows);
      else if (u.reportType === 'product')    products.push(...u.rows);
    }
    return { campaigns, searchTerms, products, allRows };
  }, [uploads]);

  const summary = useMemo(() => {
    const rows = campaigns.length ? campaigns : allRows;
    return rows.length ? aggregateMetrics(rows) : null;
  }, [campaigns, allRows]);

  const recommendations = useMemo(
    () => generateRecommendations({ campaigns, searchTerms, products }, thresholds),
    [campaigns, searchTerms, products, thresholds]
  );

  const trackedFingerprints = useMemo(
    () => new Set(trackedActions.map(makeFingerprint)),
    [trackedActions]
  );

  const hasData       = allRows.length > 0;
  const noReportTypes = uploads.some(u => u.reportType === 'unknown');

  // ── Tracked-action CRUD ────────────────────────────────────────────────────
  function trackAction(rec) {
    const fp = makeFingerprint(rec);
    if (trackedFingerprints.has(fp)) return;

    const newAction = {
      id:          genId(),
      fingerprint: fp,
      createdAt:   new Date().toISOString(),
      status:      'open',
      severity:    rec.severity,
      type:        rec.type,
      headline:    rec.headline,
      explanation: rec.explanation,
      action:      rec.action,
      entity:      rec.entity,
    };

    setTrackedActions(prev => {
      let next = [newAction, ...prev];
      if (next.length > MAX_TRACKED_ACTIONS) {
        const prunable = next.filter(a => a.status === 'done' || a.status === 'ignored');
        if (prunable.length > 0) {
          const pruneId = prunable[prunable.length - 1].id;
          next = next.filter(a => a.id !== pruneId);
        }
      }
      persistTrackedActions(next);
      return next;
    });
  }

  function updateActionStatus(id, newStatus) {
    setTrackedActions(prev => {
      const next = prev.map(a => a.id === id ? { ...a, status: newStatus } : a);
      persistTrackedActions(next);
      return next;
    });
  }

  function deleteTrackedAction(id) {
    setTrackedActions(prev => {
      const next = prev.filter(a => a.id !== id);
      persistTrackedActions(next);
      return next;
    });
  }

  // ── History CRUD ───────────────────────────────────────────────────────────
  function saveWeek(weekLabel) {
    if (!summary) return;

    const label = (weekLabel || '').trim() ||
      `Week of ${new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })}`;

    const topCampaigns = [...campaigns]
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, 10);

    const winners = searchTerms
      .filter(r =>
        r.orders > 0 &&
        r.acos !== 'NO_SALES' &&
        typeof r.acos === 'number' &&
        r.acos <= thresholds.targetACoS
      )
      .slice(0, 10);

    const wasted = searchTerms
      .filter(r => r.orders === 0 && (r.spend || 0) >= thresholds.maxNoOrderSpend)
      .slice(0, 10);

    const entry = {
      id:          genId(),
      savedAt:     new Date().toISOString(),
      weekLabel:   label,
      uploadNames: uploads.map(u => u.filename),
      summary,
      topCampaigns,
      topTerms: [...winners, ...wasted],
    };

    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 12);
      lsSet(STORAGE_KEY_HISTORY, JSON.stringify(next));
      return next;
    });
  }

  function deleteHistoryEntry(id) {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id);
      lsSet(STORAGE_KEY_HISTORY, JSON.stringify(next));
      return next;
    });
  }

  // ── Nav badge counts ───────────────────────────────────────────────────────
  const activeTrackedCount = trackedActions.filter(
    a => a.status === 'open' || a.status === 'in_progress'
  ).length;

  // ── Tab content ────────────────────────────────────────────────────────────
  function renderContent() {
    switch (activeTab) {

      case 'overview':
        return (
          <>
            <div style={s.sectionTitle}>Performance Overview</div>
            <div style={s.sectionSub}>
              Aggregated from {campaigns.length} campaign rows, {searchTerms.length} search term rows, {products.length} product rows
            </div>
            {noReportTypes && (
              <div style={s.banner}>
                ⚠ Some uploaded files have an unknown report type. Use the upload panel to select the correct type.
              </div>
            )}
            <OverviewCards summary={summary} thresholds={thresholds} />
            {hasData && recommendations.filter(r => r.severity === 'HIGH').length > 0 && (
              <>
                <div style={{ ...s.sectionTitle, fontSize: 14, marginBottom: 8, marginTop: 24 }}>
                  🔴 {recommendations.filter(r => r.severity === 'HIGH').length} High-Priority Issues
                </div>
                {recommendations.filter(r => r.severity === 'HIGH').slice(0, 3).map((rec, i) => (
                  <div key={i} style={{
                    background: 'rgba(239,68,68,0.07)',
                    border: '1px solid rgba(239,68,68,0.20)',
                    borderRadius: T.radius.sm,
                    padding: '10px 14px',
                    marginBottom: 8,
                  }}>
                    <div style={{ color: T.color.red, fontWeight: 700, fontSize: 13 }}>{rec.headline}</div>
                    <div style={{ color: T.color.muted, fontSize: 12, marginTop: 4 }}>→ {rec.action}</div>
                  </div>
                ))}
              </>
            )}
          </>
        );

      case 'campaigns':
        return (
          <>
            <div style={s.sectionTitle}>Campaign Health</div>
            <div style={s.sectionSub}>Health score, ACoS, ROAS and suggested actions per campaign</div>
            <CampaignTable campaigns={campaigns} thresholds={thresholds} />
          </>
        );

      case 'products':
        return (
          <>
            <div style={s.sectionTitle}>Product Performance</div>
            <div style={s.sectionSub}>Performance per advertised ASIN / SKU</div>
            <ProductTable products={products} searchTerms={searchTerms} thresholds={thresholds} />
          </>
        );

      case 'searchTerms':
        return (
          <>
            <div style={s.sectionTitle}>Search Term Analyzer</div>
            <div style={s.sectionSub}>Winners, wasted spend, low CTR, and high CPC terms</div>
            <SearchTermTable searchTerms={searchTerms} thresholds={thresholds} />
          </>
        );

      case 'negatives':
        return (
          <>
            <div style={s.sectionTitle}>Negative Keyword Builder</div>
            <div style={s.sectionSub}>
              Auto-detected wasted search terms — review, adjust type, and export as CSV
            </div>
            <NegativeKeywordBuilder searchTerms={searchTerms} thresholds={thresholds} />
          </>
        );

      case 'winners':
        return (
          <>
            <div style={s.sectionTitle}>Winning Keyword Builder</div>
            <div style={s.sectionSub}>
              High-performing search terms — review, prioritize, and export a seed list for Exact Match campaigns
            </div>
            <WinningKeywordBuilder searchTerms={searchTerms} thresholds={thresholds} />
          </>
        );

      case 'scaling':
        return (
          <>
            <div style={s.sectionTitle}>Campaign Scaling Plan</div>
            <div style={s.sectionSub}>
              Specific next steps per campaign — based on ACoS, ROAS, CTR, spend, and threshold targets
            </div>
            <ScalingPlan campaigns={campaigns} thresholds={thresholds} />
          </>
        );

      case 'readiness':
        return (
          <>
            <div style={s.sectionTitle}>Product Ad Readiness</div>
            <div style={s.sectionSub}>
              0–100 readiness score per ASIN — identifies which products are ready to scale and which need attention first
            </div>
            <ProductReadiness products={products} searchTerms={searchTerms} thresholds={thresholds} />
          </>
        );

      case 'recommendations':
        return (
          <>
            <div style={s.sectionTitle}>Smart Recommendations</div>
            <div style={s.sectionSub}>
              {recommendations.length} rule-based recommendations — click{' '}
              <span style={{ color: T.color.cyan }}>Track →</span> to add any item to the Action Tracker
            </div>
            <RecommendationList
              recommendations={recommendations}
              trackedFingerprints={trackedFingerprints}
              onTrackAction={trackAction}
            />
          </>
        );

      case 'actions':
        return (
          <>
            <div style={s.sectionTitle}>PPC Action Tracker</div>
            <div style={s.sectionSub}>
              {activeTrackedCount} active action{activeTrackedCount !== 1 ? 's' : ''} &middot; track recommendations from the Recommendations tab
            </div>
            <TrackedActionList
              trackedActions={trackedActions}
              onUpdateStatus={updateActionStatus}
              onDelete={deleteTrackedAction}
            />
          </>
        );

      case 'report':
        return (
          <>
            <div style={s.sectionTitle}>Weekly Report Generator</div>
            <div style={s.sectionSub}>Copy-paste ready summary for management — save to History to compare week over week</div>
            <WeeklyReport
              summary={summary}
              campaigns={campaigns}
              recommendations={recommendations}
              onSaveWeek={saveWeek}
            />
          </>
        );

      case 'bossReport':
        return (
          <>
            <div style={s.sectionTitle}>PPC Boss Report</div>
            <div style={s.sectionSub}>Executive-level account summary — narrative tone, account health score, wins and issues in one copy-paste block</div>
            <BossReport
              summary={summary}
              campaigns={campaigns}
              searchTerms={searchTerms}
              products={products}
              recommendations={recommendations}
              trackedActions={trackedActions}
              history={history}
              thresholds={thresholds}
            />
          </>
        );

      case 'history':
        return (
          <>
            <div style={s.sectionTitle}>PPC History</div>
            <div style={s.sectionSub}>
              Weekly snapshots saved from the Weekly Report tab — compare ACoS and ROAS week over week
            </div>
            <HistoryPanel history={history} onDelete={deleteHistoryEntry} />
          </>
        );

      case 'settings':
        return (
          <>
            <div style={s.sectionTitle}>Threshold Settings</div>
            <div style={s.sectionSub}>Configure targets that drive health scores and recommendations</div>
            <ThresholdSettings thresholds={thresholds} onThresholdsChange={setThresholds} />
          </>
        );

      default:
        return null;
    }
  }

  // ── Badge helpers ──────────────────────────────────────────────────────────
  function getBadge(itemKey) {
    if (itemKey === 'recommendations') return recommendations.length || null;
    if (itemKey === 'actions')         return activeTrackedCount || null;
    if (itemKey === 'history')         return history.length || null;

    if (itemKey === 'negatives') return searchTerms.filter(r =>
      (r.orders ?? 0) === 0 && (r.sales ?? 0) === 0 &&
      (r.spend  ?? 0) >= thresholds.maxNoOrderSpend &&
      ((r.spend ?? 0) > 0 || (r.clicks ?? 0) > 0)
    ).length || null;

    if (itemKey === 'winners') return searchTerms.filter(r =>
      (r.orders ?? 0) >= thresholds.minOrders &&
      typeof r.acos === 'number' && r.acos <= thresholds.targetACoS &&
      typeof r.roas === 'number' && r.roas >= thresholds.goodROASThreshold
    ).length || null;

    if (itemKey === 'scaling') {
      const seen = new Set(); let n = 0;
      for (const c of campaigns) {
        const name = c.campaignName ?? '';
        if (seen.has(name)) continue; seen.add(name);
        if (
          (c.orders ?? 0) >= thresholds.minOrders &&
          typeof c.acos === 'number' && c.acos <= thresholds.targetACoS &&
          typeof c.roas === 'number' && c.roas >= thresholds.goodROASThreshold
        ) n++;
      }
      return n || null;
    }

    if (itemKey === 'readiness') {
      const seen = new Set(); let n = 0;
      for (const p of products) {
        const id = p.asin ?? p.sku ?? '';
        if (seen.has(id)) continue; seen.add(id);
        if (
          (p.orders ?? 0) >= thresholds.minOrders &&
          typeof p.acos === 'number' && p.acos <= thresholds.targetACoS &&
          typeof p.roas === 'number' && p.roas >= thresholds.goodROASThreshold
        ) n++;
      }
      return n || null;
    }

    return null;
  }

  function getBadgeColor(itemKey) {
    if (itemKey === 'actions')   return T.color.orange;
    if (itemKey === 'negatives') return T.color.red;
    return T.color.green;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* ── Body: UploadPanel + main content ── */}
      <div style={s.body}>
          <UploadPanel uploads={uploads} onUploadsChange={setUploads} />

          <div style={s.main}>
            {/* Glass tab navigation */}
            <nav style={s.subNav} className="ppc-subnav">
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                const badge  = getBadge(item.key);

                return (
                  <button
                    key={item.key}
                    style={{
                      ...s.navBtn,
                      ...(active ? s.navBtnActive : {}),
                    }}
                    onClick={() => setActiveTab(item.key)}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.color = T.color.muted;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.color = T.color.dim;
                      }
                    }}
                  >
                    {item.label}
                    {badge > 0 && (
                      <span style={{
                        marginLeft: 5,
                        background: getBadgeColor(item.key),
                        color: '#fff',
                        borderRadius: T.radius.pill,
                        padding: '1px 6px',
                        fontSize: 10,
                        fontWeight: 700,
                        verticalAlign: 'middle',
                      }}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Tab content */}
            <div style={s.tabContent}>
              {renderContent()}
            </div>
          </div>
        </div>
    </div>
  );
}
