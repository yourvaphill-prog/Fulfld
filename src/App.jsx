import { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';
import PPCApp from './ppc/PPCApp.jsx';
import UPCScanner from './upc/UPCScanner.jsx';
import CommandCenterLanding from './CommandCenterLanding.jsx';
import ppcBg    from './assets/ppc-bg.jpg';
import fufldLogo from './assets/fufld-logo.png';
import Papa from 'papaparse';
import { Upload, Settings, Download, Users, X, ChevronDown, LogOut, Zap } from 'lucide-react';

import { idbSet, idbGetAll, idbClear } from './utils/idb.js';
import { loadKPISettings, saveKPISettings, loadUser, saveUser } from './utils/storage.js';
import { detectType, buildSubcatNodeMap, buildBrandSubcatMaps, buildAdspyMap, getBrandSubcatRevenue, fmt, money } from './utils/csvHelpers.js';
import { calcScore, scoreColor, DEFAULT_KPI, KPI_PRESETS } from './utils/scoring.js';
import { useSharedStatuses, useActivityFeed, useOnlinePresence, useSyncedDatasets } from './hooks/useSharedState.js';
import Dashboard from './components/Dashboard.jsx';
import BrandDetail from './components/BrandDetail.jsx';
import ActivityFeed from './components/ActivityFeed.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const G      = '#00ff87';
const B      = '#3b82f6';
const BG     = '#080c12';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';

// ── Team members ──────────────────────────────────────────────────────────────
const TEAM = ['Phillip', 'Johan', 'Cesar', 'Pat', 'King', 'Other'];

// ── UserPicker ────────────────────────────────────────────────────────────────
function UserPicker({ onSelect }) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", zIndex: 9999,
    }}>
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 16, padding: '40px 48px', maxWidth: 420, width: '90%',
        backdropFilter: 'blur(12px)', textAlign: 'center',
        boxShadow: `0 0 60px rgba(0,255,135,0.06)`,
      }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>👋</span>
        </div>
        <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 6px', letterSpacing: '0.02em' }}>
          Who are you?
        </h2>
        <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 28px' }}>
          Your name appears in shared activity logs
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TEAM.filter(n => n !== 'Other').map(name => (
            <button key={name} onClick={() => onSelect(name)} style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '10px 16px', color: '#e2e8f0',
              fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,135,0.08)'; e.currentTarget.style.borderColor = `${G}40`; e.currentTarget.style.color = G; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#e2e8f0'; }}
            >
              {name}
            </button>
          ))}

          {!showCustom ? (
            <button onClick={() => setShowCustom(true)} style={{
              background: 'transparent', border: `1px dashed ${BORDER}`,
              borderRadius: 8, padding: '10px 16px', color: '#475569',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              + Other / Custom name
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && custom.trim() && onSelect(custom.trim())}
                placeholder="Your name…"
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                onClick={() => custom.trim() && onSelect(custom.trim())}
                disabled={!custom.trim()}
                style={{
                  background: G, border: 'none', borderRadius: 8,
                  padding: '10px 16px', color: '#080c12', fontSize: 12,
                  fontFamily: 'inherit', cursor: custom.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 700, opacity: custom.trim() ? 1 : 0.5,
                }}
              >
                Go
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LoadingScreen ─────────────────────────────────────────────────────────────
function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `2px solid ${BORDER}`,
          borderTopColor: G,
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
      <span style={{ color: '#64748b', fontSize: 12 }}>{message}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── CSV Upload Drop Zone ───────────────────────────────────────────────────────
function UploadZone({ onFiles, hasData }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    if (files.length) onFiles(files);
  }, [onFiles]);

  const handleChange = useCallback((e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.csv'));
    if (files.length) onFiles(files);
    e.target.value = '';
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? G : BORDER}`,
        borderRadius: 12, padding: '32px 24px', textAlign: 'center',
        background: dragging ? 'rgba(0,255,135,0.04)' : 'rgba(255,255,255,0.01)',
        cursor: 'pointer', transition: 'all 0.2s',
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <Upload size={24} color={dragging ? G : '#475569'} style={{ marginBottom: 12 }} />
      <div style={{ color: dragging ? G : '#94a3b8', fontSize: 13, marginBottom: 4 }}>
        {hasData ? 'Drop CSVs to add / replace data' : 'Drop CSV files here to get started'}
      </div>
      <div style={{ color: '#334155', fontSize: 11 }}>
        or click to browse — brands, products, sellers, adspy, subcategories
      </div>
      <input ref={inputRef} type="file" accept=".csv" multiple onChange={handleChange} style={{ display: 'none' }} />
    </div>
  );
}

// ── KPI Error Boundary ────────────────────────────────────────────────────────
class KPIErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[KPI Settings] Render error caught by boundary:', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 740, margin: '0 auto', padding: '48px 24px', textAlign: 'center', fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div style={{ color: '#ef476f', fontSize: 13, marginBottom: 16 }}>
            KPI Settings failed to render.
          </div>
          <div style={{ color: '#475569', fontSize: 11, marginBottom: 24 }}>
            {String(this.state.error?.message || 'Unknown error')}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.(); }}
            style={{ background: G, border: 'none', borderRadius: 8, padding: '9px 20px', color: '#080c12', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            Reset to Defaults &amp; Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── KPI Settings Page ─────────────────────────────────────────────────────────
function KPISettingsPage({ kpiSettings, onSave }) {
  // Safe initialiser — never throws, always produces a valid KPI object
  const [local, setLocal] = useState(() => {
    try {
      const base = (kpiSettings && kpiSettings.weights && typeof kpiSettings.weights === 'object')
        ? kpiSettings
        : DEFAULT_KPI;
      const clone = JSON.parse(JSON.stringify(base));
      // Final structural check after clone
      if (!clone.weights || !Number.isFinite(clone.weights.revenue)) {
        console.warn('[KPI Settings] Loaded settings are invalid — using DEFAULT_KPI');
        return JSON.parse(JSON.stringify(DEFAULT_KPI));
      }
      return clone;
    } catch (e) {
      console.error('[KPI Settings] useState init failed, using DEFAULT_KPI:', e);
      return JSON.parse(JSON.stringify(DEFAULT_KPI));
    }
  });
  const [dirty, setDirty] = useState(false);

  // Guard: if local is somehow null/corrupted after mount, reset
  if (!local || !local.weights) {
    console.error('[KPI Settings] local state is invalid — resetting to DEFAULT_KPI');
    // Can't call setState during render — trigger via useEffect instead
  }
  const safeLocal = (local && local.weights) ? local : DEFAULT_KPI;

  // Nested path getter: 'weights.revenue' → safeLocal.weights.revenue
  const getVal = (path) => {
    try {
      const v = path.split('.').reduce((o, k) => o?.[k], safeLocal);
      return (v !== undefined && v !== null && v !== '') ? v : '';
    } catch { return ''; }
  };

  // Nested path setter (handles 'weights.revenue' and flat 'minRevenue')
  const setNum = (path, rawVal) => {
    try {
      const num = parseFloat(rawVal);
      if (isNaN(num)) return;
      const [top, sub] = path.split('.');
      setLocal(prev => {
        const base = (prev && prev.weights) ? prev : DEFAULT_KPI;
        return sub
          ? { ...base, [top]: { ...(base[top] || {}), [sub]: num } }
          : { ...base, [top]: num };
      });
      setDirty(true);
    } catch (e) { console.error('[KPI Settings] setNum error:', e); }
  };

  const toggleBool = (key) => {
    setLocal(prev => {
      const base = (prev && prev.weights) ? prev : DEFAULT_KPI;
      return { ...base, [key]: !base[key] };
    });
    setDirty(true);
  };

  const loadPreset = (preset) => {
    try {
      const p = KPI_PRESETS[preset];
      if (p) { setLocal(JSON.parse(JSON.stringify(p))); setDirty(true); }
    } catch (e) { console.error('[KPI Settings] loadPreset error:', e); }
  };

  // ── Field definitions matching scoring.js structure exactly ──────────────────
  const WEIGHT_FIELDS = [
    { path: 'weights.revenue',           label: 'Revenue Weight',           min: 0, max: 100, step: 1 },
    { path: 'weights.sellers',           label: 'Sellers Weight',           min: 0, max: 100, step: 1 },
    { path: 'weights.amazonPct',         label: 'Amazon % Weight',          min: 0, max: 100, step: 1 },
    { path: 'weights.growth',            label: 'Growth Weight',            min: 0, max: 100, step: 1 },
    { path: 'weights.brandScore',        label: 'Brand Score Weight',       min: 0, max: 100, step: 1 },
    { path: 'weights.marketOpportunity', label: 'Market Opp Weight',        min: 0, max: 100, step: 1 },
  ];

  const THRESHOLD_FIELDS = [
    { path: 'minRevenue',          label: 'Min Revenue ($)',         min: 0,   max: 10_000_000, step: 50_000 },
    { path: 'minSellers',          label: 'Min Avg Sellers',         min: 0,   max: 50,         step: 1 },
    { path: 'maxDominantShare',    label: 'Max Dominant Share (%)',  min: 0,   max: 100,        step: 5 },
    { path: 'minIdealMarketShare', label: 'Min Ideal MS (%)',        min: 0,   max: 50,         step: 1 },
    { path: 'maxIdealMarketShare', label: 'Max Ideal MS (%)',        min: 0,   max: 100,        step: 5 },
    { path: 'dominantMarketShare', label: 'Dominant MS (%)',         min: 0,   max: 100,        step: 5 },
  ];

  const card  = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16, backdropFilter: 'blur(8px)' };
  const secHd = { color: '#64748b', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
  const lbl   = { color: '#94a3b8', fontSize: 11, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", marginBottom: 6, display: 'block' };
  const inp   = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 12, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px', fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 24px', letterSpacing: '0.05em' }}>
        KPI SETTINGS
      </h2>

      {/* Presets */}
      <div style={card}>
        <div style={secHd}>Load Preset</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.keys(KPI_PRESETS).map(p => (
            <button key={p} onClick={() => loadPreset(p)} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
              borderRadius: 6, padding: '7px 14px', color: '#94a3b8',
              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${B}60`; e.currentTarget.style.color = B; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#94a3b8'; }}
            >
              {KPI_PRESETS[p].name || p.replace(/([A-Z])/g, ' $1').trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Scoring Weights */}
      <div style={card}>
        <div style={secHd}>Scoring Weights</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px' }}>
          {WEIGHT_FIELDS.map(f => (
            <div key={f.path}>
              <label style={lbl}>{f.label}</label>
              <input type="number" min={f.min} max={f.max} step={f.step}
                value={getVal(f.path)} onChange={e => setNum(f.path, e.target.value)} style={inp} />
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div style={card}>
        <div style={secHd}>Filters &amp; Thresholds</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px' }}>
          {THRESHOLD_FIELDS.map(f => (
            <div key={f.path}>
              <label style={lbl}>{f.label}</label>
              <input type="number" min={f.min} max={f.max} step={f.step}
                value={getVal(f.path)} onChange={e => setNum(f.path, e.target.value)} style={inp} />
            </div>
          ))}
        </div>
      </div>

      {/* Reject rules */}
      <div style={card}>
        <div style={secHd}>Reject Rules</div>
        {[
          { key: 'rejectAmazonDominant',    label: 'Reject Amazon-Dominant Brands' },
          { key: 'rejectBrandSelfDominant', label: 'Reject Brand Self-Dominant Brands' },
        ].map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <input type="checkbox" id={f.key} checked={!!safeLocal[f.key]} onChange={() => toggleBool(f.key)}
              style={{ width: 14, height: 14, accentColor: G, cursor: 'pointer' }} />
            <label htmlFor={f.key} style={{ color: '#e2e8f0', fontSize: 12, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", cursor: 'pointer' }}>
              {f.label}
            </label>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 4, display: 'flex', gap: 10 }}>
        <button
          onClick={() => { onSave(safeLocal); setDirty(false); }}
          disabled={!dirty}
          style={{
            background: dirty ? G : 'rgba(0,255,135,0.2)', border: 'none',
            borderRadius: 8, padding: '10px 24px', color: dirty ? '#080c12' : '#334155',
            fontSize: 12, fontFamily: 'inherit', cursor: dirty ? 'pointer' : 'not-allowed',
            fontWeight: 700, transition: 'all 0.2s',
          }}
        >
          Save Settings
        </button>
        <button
          onClick={() => { setLocal(JSON.parse(JSON.stringify(DEFAULT_KPI))); setDirty(true); }}
          style={{
            background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '10px 24px', color: '#64748b',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Reset to Default
        </button>
      </div>
    </div>
  );
}

// ── Export Page ───────────────────────────────────────────────────────────────
function ExportPage({ scoredBrands, statuses }) {
  const exportCSV = (rows, filename) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitted   = scoredBrands.filter(b => statuses[b['Brand Name']]?.status === 'submitted');
  const contacted   = scoredBrands.filter(b => statuses[b['Brand Name']]?.status === 'contacted');
  const highOpp     = scoredBrands.filter(b => (b._score || 0) >= 70 && !statuses[b['Brand Name']]?.status);

  const EXPORTS = [
    { label: 'Submitted Brands',    color: G,        rows: submitted, file: 'fulfld_submitted.csv',   count: submitted.length },
    { label: 'Contacted Brands',    color: '#ffd166', rows: contacted, file: 'fulfld_contacted.csv',  count: contacted.length },
    { label: 'High Opportunity',    color: B,         rows: highOpp,   file: 'fulfld_high_opp.csv',   count: highOpp.length   },
    { label: 'All Scored Brands',   color: '#94a3b8', rows: scoredBrands, file: 'fulfld_all_brands.csv', count: scoredBrands.length },
  ];

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px', fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 24px', letterSpacing: '0.05em' }}>
        EXPORT
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {EXPORTS.map(ex => (
          <div key={ex.file} style={{
            background: CARD, border: `1px solid ${ex.color}22`,
            borderRadius: 12, padding: '20px 24px', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ color: ex.color, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{ex.label}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>{ex.count} brand{ex.count !== 1 ? 's' : ''}</div>
            </div>
            <button
              onClick={() => exportCSV(ex.rows, ex.file)}
              disabled={ex.count === 0}
              style={{
                background: ex.count ? `${ex.color}18` : 'transparent',
                border: `1px solid ${ex.count ? ex.color + '50' : BORDER}`,
                borderRadius: 8, padding: '8px 18px', color: ex.count ? ex.color : '#334155',
                fontSize: 11, fontFamily: 'inherit', cursor: ex.count ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Duplicate Checker ─────────────────────────────────────────────────────────
function DuplicateChecker({ scoredBrands }) {
  const [input, setInput]     = useState('');
  const [results, setResults] = useState(null);

  const check = () => {
    const names = input.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
    const matched = scoredBrands.filter(b => names.includes((b['Brand Name'] || '').toLowerCase()));
    setResults({ searched: names.length, found: matched });
  };

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px', fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 24px', letterSpacing: '0.05em' }}>
        DUPLICATE CHECKER
      </h2>

      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '24px', backdropFilter: 'blur(8px)', marginBottom: 16,
      }}>
        <label style={{ color: '#64748b', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>
          Paste brand names (one per line)
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={8}
          placeholder="Brand A&#10;Brand B&#10;Brand C"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '12px', color: '#e2e8f0', fontSize: 12,
            fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={check}
          disabled={!input.trim() || !scoredBrands.length}
          style={{
            marginTop: 12, background: B, border: 'none', borderRadius: 8,
            padding: '9px 20px', color: '#fff', fontSize: 12, fontFamily: 'inherit',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          Check Brands
        </button>
      </div>

      {results && (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '24px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 14 }}>
            Found <span style={{ color: G, fontWeight: 600 }}>{results.found.length}</span> of {results.searched} searched brands
          </div>
          {results.found.length === 0 ? (
            <div style={{ color: '#334155', fontSize: 12 }}>No matches found in current dataset.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.found.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6, border: `1px solid ${BORDER}`,
                }}>
                  <span style={{ color: '#e2e8f0', fontSize: 12 }}>{b['Brand Name']}</span>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ color: scoreColor(b._score), fontSize: 11 }}>Score: {Math.round(b._score || 0)}</span>
                    <span style={{ color: '#475569', fontSize: 11 }}>{money(b['Est. Monthly Revenue'])}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // ── User identity ──
  const [userName, setUserName] = useState(() => loadUser());
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Data state ──
  const [allData, setAllData]   = useState({ brands: [], products: [], sellers: [], adspy: [], subcategories: [] });
  const [dbReady, setDbReady]   = useState(false);
  const [parsing, setParsing]   = useState(false);

  // ── KPI settings — always initialised to a valid object ──
  const [kpiSettings, setKpiSettings] = useState(() => {
    const s = loadKPISettings();
    return (s?.weights) ? s : DEFAULT_KPI;
  });

  // ── Page ──
  const [page, setPage]             = useState('home');
  const [selectedBrand, setSelected] = useState(null);
  const [showUpload, setShowUpload]          = useState(false);
  const [showModuleSwitcher, setShowModuleSwitcher] = useState(false);

  // ── Shared state hooks ──
  const { statuses, updateStatus } = useSharedStatuses(userName);
  const { feed, logActivity }      = useActivityFeed();
  const { onlineUsers }            = useOnlinePresence(userName);

  // ── Cloud CSV sync ──
  // When any user uploads a CSV it is persisted to Supabase; other users'
  // apps receive the update via realtime and merge it into their local state.
  const handleCloudData = useCallback((type, data) => {
    const safeData = Array.isArray(data) ? data : [];
    setAllData(prev => {
      if (prev[type] === safeData) return prev; // referential equality fast-exit
      const next = { ...prev, [type]: safeData };
      idbSet(type, safeData).catch(() => {});
      return next;
    });
  }, []); // setAllData & idbSet are stable

  const { syncing: cloudSyncing, uploadDataset } = useSyncedDatasets(handleCloudData);

  // ── Restore from IndexedDB on mount ──
  useEffect(() => {
    idbGetAll().then(stored => {
      if (stored && Object.keys(stored).some(k => (stored[k] || []).length > 0)) {
        setAllData(prev => ({ ...prev, ...stored }));
      }
      setDbReady(true);
    }).catch(() => setDbReady(true));
  }, []);

  // ── CSV parsing ──
  const parseFiles = useCallback((files) => {
    if (!files.length) return;
    setParsing(true);

    const pending = files.length;
    let done = 0;
    const updates = {};

    files.forEach(file => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: ({ data, meta }) => {
          const type = detectType(meta.fields || []);
          if (type !== 'unknown') updates[type] = data;
          done++;
          if (done === pending) {
            setAllData(prev => {
              const next = { ...prev, ...updates };
              Object.entries(updates).forEach(([k, v]) => {
                idbSet(k, v).catch(() => {});
                // Upload to Supabase so other team members see the new data
                uploadDataset(k, v, userName);
              });
              return next;
            });
            setParsing(false);
            setShowUpload(false);
          }
        },
        error: () => {
          done++;
          if (done === pending) setParsing(false);
        },
      });
    });
  }, [uploadDataset, userName]);

  // ── Derived maps ──
  const subcatNodeMap   = useMemo(() => buildSubcatNodeMap(allData.subcategories), [allData.subcategories]);
  const brandSubcatMaps = useMemo(() => buildBrandSubcatMaps(allData.products),    [allData.products]);
  const adspyMap        = useMemo(() => buildAdspyMap(allData.adspy),              [allData.adspy]);

  // ── Scored brands ──
  const scoredBrands = useMemo(() => {
    const brands = Array.isArray(allData.brands) ? allData.brands : [];
    if (!brands.length) return [];
    return brands.map(brand => {
      const brandKey  = (brand['Brand Name'] || '').toLowerCase().trim();
      // Match the same field priority BrandDetail uses
      const subcatRaw = (
        brand['Top Subcategory Name'] ||
        brand['Primary Subcategory Name'] ||
        brand['Primary Subcategory'] || ''
      ).toLowerCase().trim();
      const totalRev  = Number(brand['Est. Monthly Revenue']) || 0;

      // Market share % — use product-level brand revenue in subcategory
      // divided by total subcategory revenue (same logic as BrandDetail)
      let msPct = null;
      const brandSubcatRev = getBrandSubcatRevenue(brandKey, subcatRaw, totalRev, brandSubcatMaps);
      if (brandSubcatRev !== null) {
        const subcatNode     = subcatNodeMap.get(subcatRaw);
        const subcatTotalRev = subcatNode ? (Number(subcatNode['Estimated Monthly Revenue']) || 0) : 0;
        if (subcatTotalRev > 0) {
          const raw = brandSubcatRev / subcatTotalRev;
          if (raw <= 1) msPct = raw; // discard mismatch (>100%) same as BrandDetail
        }
      }

      // Ad data
      const adRow = adspyMap.get(brandKey);

      // calcScore returns { score, breakdown, rejectReasons, isCallReady }
      const { score, breakdown, rejectReasons, isCallReady } =
        calcScore(brand, kpiSettings, msPct, adRow || null);

      return {
        ...brand,
        __score:         score,
        __breakdown:     Array.isArray(breakdown)     ? breakdown     : [],
        __rejectReasons: Array.isArray(rejectReasons) ? rejectReasons : [],
        __isCallReady:   !!isCallReady,
        __isDupe:        false,
        _msPct:          msPct,
      };
    });
  }, [allData.brands, kpiSettings, subcatNodeMap, brandSubcatMaps, adspyMap]);

  // ── Status change handler ──
  const handleStatusChange = useCallback(async (brandName, newStatus) => {
    console.log(`[Status] click — brand="${brandName}" status="${newStatus}" user="${userName}"`);
    await updateStatus(brandName, newStatus);
    if (newStatus && logActivity) {
      console.log(`[Activity] logging — brand="${brandName}" action="${newStatus}" user="${userName}"`);
      await logActivity(brandName, newStatus, userName);
    }
  }, [updateStatus, logActivity, userName]);

  // ── Clear all data ──
  const clearData = useCallback(() => {
    idbClear().catch(() => {});
    setAllData({ brands: [], products: [], sellers: [], adspy: [], subcategories: [] });
    setSelected(null);
  }, []);

  // ── Wait for DB init ──
  if (!dbReady) return <LoadingScreen message="Restoring saved data…" />;

  // ── User pick ──
  if (!userName) {
    return <UserPicker onSelect={name => { saveUser(name); setUserName(name); }} />;
  }

  const hasData = (Array.isArray(allData.brands) ? allData.brands.length : 0) > 0;

  // ── Color dot for online users ──
  const onlineOthers = (Array.isArray(onlineUsers) ? onlineUsers : []).filter(u => u !== userName);

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      // Layered background: CSS grid lines → dark overlay → cyber grid image
      backgroundImage: [
        'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.020) 40px)',
        'repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.020) 40px)',
        'linear-gradient(rgba(5,8,15,0.87), rgba(5,8,15,0.87))',
        `url(${ppcBg})`,
      ].join(', '),
      backgroundSize: 'auto, auto, auto, cover',
      backgroundPosition: 'top left, top left, center, center',
      backgroundRepeat: 'repeat, repeat, no-repeat, no-repeat',
    }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,12,18,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', padding: '0 24px', height: 54,
        gap: 24,
      }}>
        {/* Logo — FUFLD image only */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img src={fufldLogo} alt="FULFLD" style={{ height: 28, width: 'auto', display: 'block' }} />
        </div>

        {/* Nav — Brand Scout tabs when in BS; labels when in PPC/Home */}
        <nav style={{ display: 'flex', gap: 2, flex: 1, alignItems: 'center' }}>
          {page !== 'ppc' && page !== 'home' && page !== 'upc' && [
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'kpi',       label: 'KPI Settings' },
            { id: 'export',    label: 'Export' },
            { id: 'dupes',     label: 'Duplicates' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setPage(id)} style={{
              background: page === id ? 'rgba(0,255,135,0.08)' : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${page === id ? G : 'transparent'}`,
              padding: '0 14px', height: 54, color: page === id ? G : '#475569',
              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}>
              {label}
            </button>
          ))}
          {(page === 'ppc' || page === 'home' || page === 'upc') && (
            <span style={{
              color: '#1e293b', fontSize: 10, letterSpacing: '0.10em',
              textTransform: 'uppercase', paddingLeft: 4,
            }}>
              {page === 'home' ? 'Module Selection' : 'Command Center'}
            </span>
          )}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>

          {/* Online users */}
          {onlineOthers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {onlineOthers.slice(0, 4).map(u => (
                <div key={u} title={u} style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${B}40, ${G}40)`,
                  border: `1px solid ${G}40`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 9, color: G, fontWeight: 700,
                }}>
                  {u[0].toUpperCase()}
                </div>
              ))}
              {onlineOthers.length > 4 && (
                <span style={{ color: '#475569', fontSize: 10 }}>+{onlineOthers.length - 4}</span>
              )}
            </div>
          )}

          {/* Cloud syncing indicator */}
          {cloudSyncing && (
            <span style={{ color: B, fontSize: 10, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: B, animation: 'spin 1s linear infinite', display: 'inline-block' }} />
              syncing…
            </span>
          )}

          {/* Module Switcher — only visible when inside a module, not on landing */}
          {page !== 'home' && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowModuleSwitcher(s => !s)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${page === 'ppc' ? 'rgba(6,182,212,0.28)' : page === 'upc' ? 'rgba(245,158,11,0.28)' : BORDER}`,
                  borderRadius: 7, padding: '5px 12px',
                  color: page === 'ppc' ? '#06b6d4' : page === 'upc' ? '#f59e0b' : '#94a3b8',
                  fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {page === 'ppc' ? '⚡ PPC Pilot' : page === 'upc' ? '🏷️ UPC Scanner' : '🔍 Brand Scout'}
                <ChevronDown size={10} />
              </button>
              {showModuleSwitcher && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0,
                  background: 'rgba(8,12,22,0.97)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8, overflow: 'hidden', minWidth: 180,
                  backdropFilter: 'blur(16px)', zIndex: 300,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                }}>
                  <div style={{
                    padding: '7px 14px 5px', fontSize: 9, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: '#334155',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    Switch Module
                  </div>
                  {[
                    { id: 'home',      label: '⬡ Command Center', accent: '#a78bfa' },
                    { id: 'dashboard', label: '🔍 Brand Scout',    accent: G        },
                    { id: 'ppc',       label: '⚡ PPC Pilot',      accent: '#06b6d4' },
                    { id: 'upc',       label: '🏷️ UPC Scanner',    accent: '#f59e0b' },
                  ].map(({ id, label, accent }) => {
                    const active =
                      id === 'ppc'  ? page === 'ppc' :
                      id === 'upc'  ? page === 'upc' :
                      id === 'home' ? false :          // never "active" — it's a home link
                      page !== 'ppc' && page !== 'upc' && page !== 'home';
                    return (
                      <button key={id}
                        onClick={() => { setPage(id); setShowModuleSwitcher(false); }}
                        style={{
                          width: '100%', border: 'none', textAlign: 'left',
                          background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                          borderLeft: `3px solid ${active ? accent : 'transparent'}`,
                          padding: '9px 14px',
                          color: active ? accent : id === 'home' ? '#475569' : '#475569',
                          fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upload button */}
          <button onClick={() => setShowUpload(s => !s)} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
            borderRadius: 7, padding: '6px 12px', color: '#94a3b8',
            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Upload size={12} /> Upload CSV
          </button>

          {/* User pill */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(s => !s)}
              style={{
                background: 'rgba(0,255,135,0.08)', border: `1px solid ${G}30`,
                borderRadius: 7, padding: '5px 12px', color: G,
                fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: G, boxShadow: `0 0 6px ${G}`,
                flexShrink: 0,
              }} />
              {userName}
              <ChevronDown size={10} />
            </button>
            {showUserMenu && (
              <div style={{
                position: 'absolute', top: '110%', right: 0,
                background: 'rgba(13,20,35,0.97)', border: `1px solid ${BORDER}`,
                borderRadius: 8, overflow: 'hidden', minWidth: 160,
                backdropFilter: 'blur(12px)', zIndex: 200,
              }}>
                {TEAM.map(name => (
                  <button key={name} onClick={() => { saveUser(name); setUserName(name); setShowUserMenu(false); }} style={{
                    width: '100%', background: name === userName ? 'rgba(0,255,135,0.08)' : 'transparent',
                    border: 'none', padding: '9px 16px', color: name === userName ? G : '#94a3b8',
                    fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                  }}>
                    {name}
                  </button>
                ))}
                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                <button onClick={() => { clearData(); }} style={{
                  width: '100%', background: 'transparent', border: 'none',
                  padding: '9px 16px', color: '#ef476f', fontSize: 11,
                  fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <LogOut size={11} /> Clear All Data
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Upload drop-down panel ── */}
      {showUpload && (
        <div style={{
          position: 'fixed', top: 54, right: 24, zIndex: 300,
          width: 380, background: 'rgba(13,20,35,0.97)',
          border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: 20, backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ color: '#94a3b8', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Upload Data</span>
            <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          {parsing ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>Parsing CSV files…</div>
            </div>
          ) : (
            <UploadZone onFiles={parseFiles} hasData={hasData} />
          )}
          {hasData && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(allData).map(([k, v]) => (Array.isArray(v) ? v.length : 0) > 0 && (
                <span key={k} style={{
                  background: 'rgba(0,255,135,0.08)', border: `1px solid ${G}30`,
                  borderRadius: 4, padding: '3px 8px', fontSize: 10, color: G,
                }}>
                  {k}: {Array.isArray(v) ? v.length : 0}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Command Center landing — module selection screen ── */}
      {page === 'home' && (
        <CommandCenterLanding
          onSelectModule={(id) => setPage(id)}
        />
      )}

      {/* ── Main content ── */}
      {/* Brand Scout — always mounted, hidden when on PPC or home (preserves state) */}
      <div style={{ display: (page === 'ppc' || page === 'home' || page === 'upc') ? 'none' : 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Content area ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>

          {/* No data empty state */}
          {page === 'dashboard' && !hasData && !parsing && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: '100%', padding: 40,
            }}>
              <div style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
                padding: '48px 56px', maxWidth: 480, width: '100%', textAlign: 'center',
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 20 }}>📊</div>
                <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 10px', letterSpacing: '0.04em' }}>
                  No Data Loaded
                </h2>
                <p style={{ color: '#475569', fontSize: 12, margin: '0 0 28px', lineHeight: 1.7 }}>
                  Upload your Fulfld CSV exports to start scoring brands. Drop multiple files at once — brands, products, sellers, adspy, subcategories.
                </p>
                <UploadZone onFiles={parseFiles} hasData={false} />
              </div>
            </div>
          )}

          {/* Dashboard */}
          {page === 'dashboard' && hasData && (
            <Dashboard
              scoredBrands={scoredBrands}
              statuses={statuses}
              onStatusChange={handleStatusChange}
              onSelectBrand={setSelected}
              kpiSettings={kpiSettings}
            />
          )}

          {/* KPI Settings */}
          {page === 'kpi' && (
            <KPIErrorBoundary onReset={() => { setKpiSettings(DEFAULT_KPI); saveKPISettings(DEFAULT_KPI); }}>
              <KPISettingsPage
                kpiSettings={kpiSettings}
                onSave={settings => {
                  const valid = (settings?.weights) ? settings : DEFAULT_KPI;
                  setKpiSettings(valid);
                  saveKPISettings(valid);
                }}
              />
            </KPIErrorBoundary>
          )}

          {/* Export */}
          {page === 'export' && (
            <ExportPage scoredBrands={scoredBrands} statuses={statuses} />
          )}

          {/* Duplicate Checker */}
          {page === 'dupes' && (
            <DuplicateChecker scoredBrands={scoredBrands} />
          )}
        </main>

        {/* ── Activity feed sidebar ── */}
        <aside style={{
          width: 260, flexShrink: 0,
          borderLeft: `1px solid ${BORDER}`,
          background: 'rgba(8,12,18,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#334155', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
              Activity
            </span>
            {onlineUsers.length > 0 && (
              <span style={{ color: '#334155', fontSize: 10, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                <span style={{ color: G }}>●</span> {onlineUsers.length} online
              </span>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ActivityFeed feed={feed} />
          </div>
        </aside>
      </div>

      {/* PPC Pilot — always mounted to preserve uploaded data across tab switches */}
      <div style={{ display: page === 'ppc' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
        <PPCApp onSwitchModule={setPage} />
      </div>

      {/* UPC Scanner — always mounted to preserve scan state across tab switches */}
      <div style={{ display: page === 'upc' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
        <UPCScanner onSwitchModule={setPage} userName={userName} />
      </div>

      {/* ── Brand detail slide-in ── */}
      {selectedBrand && (
        <BrandDetail
          brand={selectedBrand}
          allData={allData}
          kpiSettings={kpiSettings}
          currentStatus={statuses[selectedBrand['Brand Name']]?.status || ''}
          onStatusChange={(name, status) => handleStatusChange(name, status)}
          onClose={() => setSelected(null)}
          subcatNodeMap={subcatNodeMap}
          brandSubcatMaps={brandSubcatMaps}
          userName={userName}
          onLogActivity={logActivity}
        />
      )}

      {/* ── Global click-away for user menu ── */}
      {showUserMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          onClick={() => setShowUserMenu(false)}
        />
      )}

      {/* Note: no separate click-away for module switcher — the header's stacking
          context (z-index:100) would place any fixed backdrop above it, blocking
          dropdown button clicks. Each option closes the dropdown on click. */}

      {/* ── Global styles ── */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${BG}; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        input:focus { border-color: ${B}80 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
      `}</style>
    </div>
  );
}
