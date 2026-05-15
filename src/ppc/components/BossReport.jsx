import React, { useState } from 'react';
import { generateBossReport } from '../utils/bossReportGenerator.js';
import { Copy, Download, CheckCircle } from 'lucide-react';

// ── Date-range label builder (same pattern as WeeklyReport) ───────────────────
function buildDateLabel(start, end) {
  if (!start || !end) return '';
  try {
    const s  = new Date(start + 'T12:00:00');
    const e  = new Date(end   + 'T12:00:00');
    const yr = e.getFullYear();
    const dm = { month: 'short', day: 'numeric' };
    const sameMonthYear =
      s.getMonth()    === e.getMonth() &&
      s.getFullYear() === e.getFullYear();

    if (sameMonthYear) return `${s.toLocaleDateString('en-US', dm)}–${e.getDate()}, ${yr}`;
    return `${s.toLocaleDateString('en-US', dm)} – ${e.toLocaleDateString('en-US', dm)}, ${yr}`;
  } catch { return ''; }
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  toolbar:   { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  dateRow:   { display: 'flex', gap: 6, alignItems: 'center' },
  dateLabel: { color: '#555', fontSize: 11, whiteSpace: 'nowrap' },
  dateInput: {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#ccc', padding: '6px 10px', fontSize: 12,
    outline: 'none', colorScheme: 'dark',
  },
  dash: { color: '#444', padding: '0 2px' },
  copyBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#1d4ed8', color: '#fff', border: 'none',
    borderRadius: 6, padding: '7px 16px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
  dlBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#111', color: '#888', border: '1px solid #2a2a2a',
    borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13,
  },
  report: {
    background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8,
    padding: '20px 24px', fontFamily: 'monospace', fontSize: 13,
    color: '#ccc', lineHeight: 1.8, whiteSpace: 'pre-wrap', minHeight: 200,
  },
  empty: { textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13 },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function BossReport({
  summary,
  campaigns    = [],
  searchTerms  = [],
  products     = [],
  recommendations = [],
  trackedActions  = [],
  history         = [],
  thresholds,
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [copied,    setCopied]    = useState(false);

  const dateLabel = buildDateLabel(startDate, endDate);

  const text = summary
    ? generateBossReport({
        summary,
        campaigns,
        searchTerms,
        products,
        recommendations,
        trackedActions,
        history,
        thresholds,
        dateLabel,
      })
    : '';

  function handleCopy() {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownload() {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `ppc-boss-report-${today}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!summary) {
    return (
      <div style={s.empty}>
        Upload reports to generate your PPC Boss Report.
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={{ color: '#888', fontSize: 13 }}>
        Executive-level account summary — paste into email, Slack, or a client update doc.
      </div>

      {/* ── Toolbar ── */}
      <div style={s.toolbar}>

        {/* Date range pickers */}
        <div style={s.dateRow}>
          <span style={s.dateLabel}>Start</span>
          <input
            type="date"
            style={s.dateInput}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <span style={s.dash}>–</span>
          <span style={s.dateLabel}>End</span>
          <input
            type="date"
            style={s.dateInput}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>

        {/* Generated label preview */}
        {dateLabel && (
          <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>
            {dateLabel}
          </span>
        )}

        <button style={s.copyBtn} onClick={handleCopy}>
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Report'}
        </button>

        <button style={s.dlBtn} onClick={handleDownload}>
          <Download size={14} /> Download .txt
        </button>
      </div>

      {/* Report output */}
      <div style={s.report}>{text}</div>
    </div>
  );
}
