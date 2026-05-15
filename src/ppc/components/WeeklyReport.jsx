import React, { useState } from 'react';
import { generateWeeklyReport } from '../utils/reportGenerator.js';
import { Copy, Download, CheckCircle } from 'lucide-react';
import { T } from '../theme.js';

// ── Date-range label builder ───────────────────────────────────────────────────
// Appending T12:00:00 prevents UTC-midnight timezone offsets from shifting the day.
function buildDateLabel(start, end) {
  if (!start || !end) return '';
  try {
    const s   = new Date(start + 'T12:00:00');
    const e   = new Date(end   + 'T12:00:00');
    const yr  = e.getFullYear();
    const dm  = { month: 'short', day: 'numeric' };
    const sameMonthYear =
      s.getMonth()    === e.getMonth() &&
      s.getFullYear() === e.getFullYear();

    if (sameMonthYear) {
      // "May 5–11, 2026"
      return `${s.toLocaleDateString('en-US', dm)}–${e.getDate()}, ${yr}`;
    }
    // "Apr 28 – May 4, 2026"
    return `${s.toLocaleDateString('en-US', dm)} – ${e.toLocaleDateString('en-US', dm)}, ${yr}`;
  } catch { return ''; }
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  container:   { display: 'flex', flexDirection: 'column', gap: 16 },
  toolbar:     { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  dateRow:     { display: 'flex', gap: 6, alignItems: 'center' },
  dateLabel:   { color: T.color.dim, fontSize: 11, whiteSpace: 'nowrap', fontFamily: T.font.mono },
  dateInput: {
    background: T.bg.input, border: `1px solid ${T.border.input}`, borderRadius: T.radius.sm,
    color: T.color.muted, padding: '6px 10px', fontSize: 12,
    outline: 'none', colorScheme: 'dark', fontFamily: T.font.mono,
  },
  dash:        { color: T.color.dim, padding: '0 2px' },
  copyBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.color.cyan, color: '#05080f', border: 'none',
    borderRadius: T.radius.sm, padding: '7px 16px', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, fontFamily: T.font.heading, letterSpacing: '0.04em',
  },
  dlBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.bg.card, color: T.color.muted, border: `1px solid ${T.border.base}`,
    borderRadius: T.radius.sm, padding: '7px 16px', cursor: 'pointer',
    fontSize: 12, fontFamily: T.font.mono,
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.bg.card, border: `1px solid ${T.border.base}`,
    borderRadius: T.radius.sm, padding: '7px 16px', cursor: 'pointer',
    fontSize: 12, transition: T.transition.base, fontFamily: T.font.mono,
  },
  hint:   { color: T.color.dim, fontSize: 11, fontStyle: 'italic', fontFamily: T.font.mono },
  report: {
    ...T.glass.card,
    borderRadius: T.radius.md,
    padding: '20px 24px', fontFamily: T.font.mono, fontSize: 13,
    color: T.color.muted, lineHeight: 1.8, whiteSpace: 'pre-wrap', minHeight: 200,
  },
  empty: { textAlign: 'center', padding: '40px 0', color: T.color.dim, fontSize: 13, fontFamily: T.font.mono },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function WeeklyReport({ summary, campaigns, recommendations, onSaveWeek }) {
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [copied,    setCopied]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  // Derived — never stored as state
  const dateLabel  = buildDateLabel(startDate, endDate);
  const datesReady = !!(startDate && endDate);

  const text = summary
    ? generateWeeklyReport(summary, campaigns, recommendations, dateLabel)
    : '';

  function handleCopy() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ppc-report${dateLabel ? '-' + dateLabel.replace(/\s/g, '-') : ''}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSave() {
    if (!summary || !onSaveWeek || !datesReady) return;
    onSaveWeek(dateLabel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!summary) {
    return <div style={s.empty}>Upload reports to generate your weekly management summary.</div>;
  }

  return (
    <div style={s.container}>
      <div style={{ color: T.color.muted, fontSize: 13, fontFamily: T.font.mono }}>
        Paste this report directly into email, Slack, or your weekly review doc.
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
          <span style={{ color: T.color.cyan, fontSize: 12, fontWeight: 600, fontFamily: T.font.mono }}>
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

        {/* Save This Week — disabled until both dates selected */}
        <button
          style={{
            ...s.saveBtn,
            color:       saved ? T.color.green : datesReady ? T.color.muted : T.color.dim,
            borderColor: saved ? `${T.color.green}44` : datesReady ? T.border.base : T.border.subtle,
            background:  saved ? `${T.color.green}11` : T.bg.card,
            cursor:      datesReady ? 'pointer' : 'not-allowed',
          }}
          onClick={handleSave}
          disabled={!datesReady}
          title={datesReady ? 'Save snapshot to History tab' : 'Select start and end dates first'}
        >
          {saved ? <CheckCircle size={14} /> : '📅'}
          {saved ? 'Saved to History!' : 'Save This Week'}
        </button>

        {!datesReady && (
          <span style={s.hint}>← select dates to enable Save</span>
        )}
      </div>

      {/* Report output */}
      <div style={s.report}>{text}</div>
    </div>
  );
}
