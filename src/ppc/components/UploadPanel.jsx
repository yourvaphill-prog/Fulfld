import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, AlertCircle, CheckCircle } from 'lucide-react';
import { detectReportType } from '../utils/reportTypeDetector.js';
import { normalizeRows } from '../utils/csvNormalizer.js';
import { enrichRows } from '../utils/metricCalculator.js';

const s = {
  panel: {
    width: 240,
    minWidth: 240,
    background: '#0d0d0d',
    borderRight: '1px solid #1e1e1e',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
    gap: 16,
  },
  heading: { color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase' },
  dropZone: {
    border: '2px dashed #2a2a2a',
    borderRadius: 8,
    padding: '20px 12px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  dropZoneActive: { borderColor: '#3b82f6' },
  uploadBtn: {
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    justifyContent: 'center',
    marginTop: 10,
  },
  fileItem: {
    background: '#111',
    borderRadius: 6,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
  },
  fileRow: { display: 'flex', alignItems: 'center', gap: 6 },
  fileName: { flex: 1, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 2 },
  typeSelect: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#ccc',
    fontSize: 12,
    padding: '3px 6px',
    width: '100%',
  },
  badge: {
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    fontWeight: 600,
  },
  clearBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    color: '#888',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    width: '100%',
  },
  errorText: { color: '#ef4444', fontSize: 11, marginTop: 2 },
  hint: { color: '#555', fontSize: 11, lineHeight: 1.4 },
};

export default function UploadPanel({ uploads, onUploadsChange }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function handleFiles(files) {
    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue;
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(result) {
          const headers = result.meta.fields || [];
          const detectedType = detectReportType(headers);
          const normalized = normalizeRows(result.data);
          const enriched = enrichRows(normalized);

          onUploadsChange(prev => [...prev, {
            id: genId(),
            filename: file.name,
            reportType: detectedType,
            headers,
            rawRows: result.data,
            rows: enriched,
            rowCount: enriched.length,
            error: result.errors.length ? result.errors[0].message : null,
          }]);
        },
        error(err) {
          onUploadsChange(prev => [...prev, {
            id: genId(),
            filename: file.name,
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
        <Upload size={22} color="#555" />
        <div style={{ color: '#555', fontSize: 12, marginTop: 8 }}>
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

      {uploads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                    <div style={{ color: '#555', fontSize: 11 }}>{u.rowCount.toLocaleString()} rows</div>
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
