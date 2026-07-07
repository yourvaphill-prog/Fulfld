import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, AlertCircle, CheckCircle } from 'lucide-react';
import { detectReportType } from '../utils/reportTypeDetector.js';
import { normalizeRows } from '../utils/csvNormalizer.js';
import { enrichRows } from '../utils/metricCalculator.js';
import { T } from '../theme.js';

const s = {
  panel: {
    width: 240,
    minWidth: 240,
    ...T.glass.panel,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
    gap: 16,
  },
  heading: { color: T.color.white, fontWeight: 700, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: T.font.heading },
  dropZone: {
    border: `2px dashed ${T.border.base}`,
    borderRadius: T.radius.md,
    padding: '20px 12px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: T.transition.base,
  },
  dropZoneActive: { borderColor: T.color.cyan },
  uploadBtn: {
    background: T.color.cyan,
    color: '#05080f',
    border: 'none',
    borderRadius: T.radius.sm,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: T.font.heading,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    justifyContent: 'center',
    marginTop: 10,
    letterSpacing: '0.04em',
  },
  fileItem: {
    ...T.glass.card,
    borderRadius: T.radius.sm,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
  },
  fileRow: { display: 'flex', alignItems: 'center', gap: 6 },
  fileName: { flex: 1, color: T.color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: T.color.dim, padding: 2 },
  typeSelect: {
    background: T.bg.input,
    border: `1px solid ${T.border.input}`,
    borderRadius: T.radius.sm,
    color: T.color.muted,
    fontSize: 12,
    padding: '3px 6px',
    width: '100%',
    outline: 'none',
    colorScheme: 'dark',
  },
  badge: {
    borderRadius: T.radius.sm,
    padding: '2px 6px',
    fontSize: 11,
    fontWeight: 600,
  },
  clearBtn: {
    background: 'none',
    border: `1px solid ${T.border.base}`,
    borderRadius: T.radius.sm,
    color: T.color.dim,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    width: '100%',
    transition: T.transition.fast,
  },
  errorText: { color: T.color.red, fontSize: 11, marginTop: 2 },
  hint: { color: T.color.dim, fontSize: 11, lineHeight: 1.5, fontFamily: T.font.mono },
};

export default function UploadPanel({ uploads, onUploadsChange }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(null);

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Same filename + size is treated as the same file re-uploaded by mistake —
  // replace the existing entry instead of stacking it, so totals don't double-count.
  function fileSignature(file) {
    return `${file.name.toLowerCase()}::${file.size}`;
  }

  function flashNotice(text) {
    setNotice(text);
    setTimeout(() => setNotice(prev => (prev === text ? null : prev)), 4000);
  }

  function handleFiles(files) {
    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue;
      const signature = fileSignature(file);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(result) {
          const headers = result.meta.fields || [];
          const detectedType = detectReportType(headers);
          const normalized = normalizeRows(result.data);
          const enriched = enrichRows(normalized);

          // Decide from the current prop (not inside the setState updater below —
          // calling another component's setState from within a state updater
          // triggers React's "setState while rendering" warning).
          if (uploads.some(u => u.signature === signature)) {
            flashNotice(`"${file.name}" was already uploaded — replaced it instead of adding a duplicate.`);
          }

          onUploadsChange(prev => {
            const dupIndex = prev.findIndex(u => u.signature === signature);
            const entry = {
              id: dupIndex >= 0 ? prev[dupIndex].id : genId(),
              filename: file.name,
              signature,
              reportType: dupIndex >= 0 ? prev[dupIndex].reportType : detectedType,
              headers,
              rawRows: result.data,
              rows: enriched,
              rowCount: enriched.length,
              error: result.errors.length ? result.errors[0].message : null,
            };
            if (dupIndex >= 0) {
              const next = [...prev];
              next[dupIndex] = entry;
              return next;
            }
            return [...prev, entry];
          });
        },
        error(err) {
          onUploadsChange(prev => [...prev, {
            id: genId(),
            filename: file.name,
            signature,
            reportType: 'unknown',
            rows: [],
            rowCount: 0,
            error: err.message,
          }]);
        },
      });
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles([...e.dataTransfer.files]);
  }

  function onInputChange(e) {
    handleFiles([...e.target.files]);
    e.target.value = '';
  }

  function removeUpload(id) {
    onUploadsChange(prev => prev.filter(u => u.id !== id));
  }

  function changeType(id, newType) {
    onUploadsChange(prev => prev.map(u => u.id === id ? { ...u, reportType: newType } : u));
  }

  return (
    <div style={s.panel}>
      <div style={s.heading}>Upload Reports</div>

      <div
        style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        <Upload size={22} color={T.color.dim} />
        <div style={{ color: T.color.dim, fontSize: 12, marginTop: 8, fontFamily: T.font.mono }}>
          Drop Amazon Ads CSV files here
        </div>
        <button style={s.uploadBtn} onClick={e => { e.stopPropagation(); inputRef.current.click(); }}>
          <Upload size={14} /> Browse Files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
      </div>

      <div style={s.hint}>
        Supports: Campaign Report, Search Term Report, Advertised Product Report
      </div>

      {notice && (
        <div style={{ color: '#eab308', fontSize: 11, fontFamily: T.font.mono, lineHeight: 1.4 }}>
          {notice}
        </div>
      )}

      {uploads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: T.color.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.font.mono }}>
            Uploaded Files
          </div>
          {uploads.map(u => (
            <div key={u.id} style={s.fileItem}>
              <div style={s.fileRow}>
                {u.error
                  ? <AlertCircle size={13} color="#ef4444" />
                  : <CheckCircle size={13} color="#22c55e" />
                }
                <span style={s.fileName} title={u.filename}>{u.filename}</span>
                <button style={s.removeBtn} onClick={() => removeUpload(u.id)}>
                  <X size={13} />
                </button>
              </div>
              {u.error
                ? <div style={s.errorText}>{u.error}</div>
                : (
                  <>
                    <div style={{ color: T.color.dim, fontSize: 11 }}>{u.rowCount.toLocaleString()} rows</div>
                    <select
                      style={s.typeSelect}
                      value={u.reportType}
                      onChange={e => changeType(u.id, e.target.value)}
                    >
                      <option value="campaign">Campaign Report</option>
                      <option value="searchTerm">Search Term Report</option>
                      <option value="product">Advertised Product Report</option>
                      <option value="unknown">Unknown</option>
                    </select>
                    {u.reportType === 'unknown' && (
                      <div style={{ color: '#eab308', fontSize: 11 }}>Select report type above</div>
                    )}
                  </>
                )}
            </div>
          ))}

          <button style={s.clearBtn} onClick={() => onUploadsChange([])}>
            Clear All Files
          </button>
        </div>
      )}
    </div>
  );
}
