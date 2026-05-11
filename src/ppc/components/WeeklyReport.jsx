import React, { useState } from 'react';
import { generateWeeklyReport } from '../utils/reportGenerator.js';
import { Copy, Download, CheckCircle } from 'lucide-react';

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  dateInput: {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#ccc', padding: '6px 12px', fontSize: 13, outline: 'none',
  },
  copyBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#1d4ed8', color: '#fff', border: 'none',
    borderRadius: 6, padding: '7px 16px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
  dlBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#111', color: '#888', border: '1px solid #2a2a2a',
    borderRadius: 6, padding: '7px 16px', cursor: 'pointer',
    fontSize: 13,
  },
  report: {
    background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8,
    padding: '20px 24px', fontFamily: 'monospace', fontSize: 13,
    color: '#ccc', lineHeight: 1.8, whiteSpace: 'pre-wrap',
    minHeight: 200,
  },
  empty: { textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13 },
};

export default function WeeklyReport({ summary, campaigns, recommendations }) {
  const [dateLabel, setDateLabel] = useState('');
  const [copied, setCopied] = useState(false);

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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ppc-report${dateLabel ? '-' + dateLabel.replace(/\s/g, '-') : ''}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!summary) {
    return <div style={s.empty}>Upload reports to generate your weekly management summary.</div>;
  }

  return (
    <div style={s.container}>
      <div style={{ color: '#888', fontSize: 13 }}>
        Paste this report directly into email, Slack, or your weekly review doc.
      </div>
      <div style={s.toolbar}>
        <input
          style={s.dateInput}
          placeholder="Date range (e.g. May 5–11, 2026)"
          value={dateLabel}
          onChange={e => setDateLabel(e.target.value)}
        />
        <button style={s.copyBtn} onClick={handleCopy}>
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Report'}
        </button>
        <button style={s.dlBtn} onClick={handleDownload}>
          <Download size={14} /> Download .txt
        </button>
      </div>
      <div style={s.report}>{text}</div>
    </div>
  );
}
