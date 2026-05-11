import React, { useMemo, useState, useEffect } from 'react';
import UploadPanel from './components/UploadPanel.jsx';
import OverviewCards from './components/OverviewCards.jsx';
import CampaignTable from './components/CampaignTable.jsx';
import ProductTable from './components/ProductTable.jsx';
import SearchTermTable from './components/SearchTermTable.jsx';
import RecommendationList from './components/RecommendationList.jsx';
import ActionList from './components/ActionList.jsx';
import WeeklyReport from './components/WeeklyReport.jsx';
import ThresholdSettings, { DEFAULT_THRESHOLDS } from './components/ThresholdSettings.jsx';
import { aggregateMetrics } from './utils/metricCalculator.js';
import { generateRecommendations } from './utils/recommendationEngine.js';

const STORAGE_KEY_THRESHOLDS = 'ppc_thresholds';
const STORAGE_KEY_TAB = 'ppc_activeTab';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'products', label: 'Products' },
  { key: 'searchTerms', label: 'Search Terms' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'actions', label: 'Action List' },
  { key: 'report', label: 'Weekly Report' },
  { key: 'settings', label: 'Settings' },
];

const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: '#050505' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  subNav: {
    display: 'flex', gap: 2, padding: '12px 20px 0',
    borderBottom: '1px solid #1a1a1a', flexShrink: 0, overflowX: 'auto',
  },
  navBtn: {
    padding: '7px 14px', borderRadius: '6px 6px 0 0', border: 'none',
    background: 'transparent', color: '#666', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  },
  content: { flex: 1, overflowY: 'auto', padding: '24px 28px' },
  sectionTitle: {
    color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 4,
  },
  sectionSub: { color: '#555', fontSize: 12, marginBottom: 20 },
  banner: {
    background: '#0d1117', border: '1px solid #1e2a3a',
    borderRadius: 8, padding: '14px 18px',
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 20, color: '#60a5fa', fontSize: 13,
  },
};

function loadThresholds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
    return raw ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) } : DEFAULT_THRESHOLDS;
  } catch { return DEFAULT_THRESHOLDS; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* quota exceeded or private mode */ }
}

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveThresholds(t) {
  lsSet(STORAGE_KEY_THRESHOLDS, JSON.stringify(t));
}

export default function PPCApp() {
  const [uploads, setUploads] = useState([]);
  const [activeTab, setActiveTab] = useState(() => lsGet(STORAGE_KEY_TAB) || 'overview');
  const [thresholds, setThresholds] = useState(loadThresholds);

  useEffect(() => { lsSet(STORAGE_KEY_TAB, activeTab); }, [activeTab]);
  useEffect(() => { saveThresholds(thresholds); }, [thresholds]);

  // Split uploads by report type
  const { campaigns, searchTerms, products, allRows } = useMemo(() => {
    const campaigns = [], searchTerms = [], products = [], allRows = [];
    for (const u of uploads) {
      if (!u.rows) continue;
      allRows.push(...u.rows);
      if (u.reportType === 'campaign') campaigns.push(...u.rows);
      else if (u.reportType === 'searchTerm') searchTerms.push(...u.rows);
      else if (u.reportType === 'product') products.push(...u.rows);
    }
    return { campaigns, searchTerms, products, allRows };
  }, [uploads]);

  const summary = useMemo(() => {
    // Use campaign rows for top-level summary; fall back to all rows if no campaign report uploaded
    const rows = campaigns.length ? campaigns : allRows;
    return rows.length ? aggregateMetrics(rows) : null;
  }, [campaigns, allRows]);

  const recommendations = useMemo(
    () => generateRecommendations({ campaigns, searchTerms, products }, thresholds),
    [campaigns, searchTerms, products, thresholds]
  );

  const hasData = allRows.length > 0;
  const noReportTypes = uploads.some(u => u.reportType === 'unknown');

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
                <div style={{ ...s.sectionTitle, fontSize: 14, marginBottom: 8 }}>
                  🔴 {recommendations.filter(r => r.severity === 'HIGH').length} High-Priority Issues
                </div>
                {recommendations.filter(r => r.severity === 'HIGH').slice(0, 3).map((rec, i) => (
                  <div key={i} style={{
                    background: '#ef444411', border: '1px solid #ef444433', borderRadius: 6,
                    padding: '10px 14px', marginBottom: 8,
                  }}>
                    <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>{rec.headline}</div>
                    <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>→ {rec.action}</div>
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
            <ProductTable products={products} thresholds={thresholds} />
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
      case 'recommendations':
        return (
          <>
            <div style={s.sectionTitle}>Smart Recommendations</div>
            <div style={s.sectionSub}>{recommendations.length} rule-based recommendations generated from your data</div>
            <RecommendationList recommendations={recommendations} />
          </>
        );
      case 'actions':
        return (
          <>
            <div style={s.sectionTitle}>Daily PPC Action List</div>
            <div style={s.sectionSub}>Check off tasks as you work through your PPC today</div>
            <ActionList recommendations={recommendations} />
          </>
        );
      case 'report':
        return (
          <>
            <div style={s.sectionTitle}>Weekly Report Generator</div>
            <div style={s.sectionSub}>Copy-paste ready summary for management</div>
            <WeeklyReport summary={summary} campaigns={campaigns} recommendations={recommendations} />
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

  return (
    <div style={s.root}>
      <div style={s.body}>
        <UploadPanel uploads={uploads} onUploadsChange={setUploads} />

        <div style={s.main}>
          <div style={s.subNav}>
            {NAV_ITEMS.map(item => {
              const active = activeTab === item.key;
              // Badge counts
              let badge = null;
              if (item.key === 'recommendations') badge = recommendations.length;
              if (item.key === 'actions') badge = recommendations.filter(r => r.severity === 'HIGH').length;
              return (
                <button
                  key={item.key}
                  style={{
                    ...s.navBtn,
                    color: active ? '#fff' : '#666',
                    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                  onClick={() => setActiveTab(item.key)}
                >
                  {item.label}
                  {badge > 0 && (
                    <span style={{
                      marginLeft: 5, background: item.key === 'actions' ? '#ef4444' : '#3b82f6',
                      color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                    }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={s.content}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
