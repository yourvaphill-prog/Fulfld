import { Download } from 'lucide-react';
import { exportCatalogCSV } from '../utils/catalogCsvExport.js';

const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PURPLE = '#a78bfa';

export default function ExportButton({ rows, brandName, disabled }) {
  const count    = rows?.length || 0;
  const isDisabled = disabled || count === 0;

  function handleExport() {
    if (isDisabled) return;
    const filename = exportCatalogCSV(rows, brandName);
    if (filename) {
      // Brief visual feedback — nothing more needed (browser triggers download)
      console.info(`[CatalogScraper] Exported ${count} rows → ${filename}`);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isDisabled}
      title={isDisabled ? 'No products to export' : `Export ${count} products as Scanner-Ready CSV`}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            7,
        background:     isDisabled ? 'rgba(167,139,250,0.05)' : 'rgba(167,139,250,0.14)',
        border:         `1px solid ${isDisabled ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.38)'}`,
        borderRadius:   8,
        padding:        '9px 18px',
        color:          isDisabled ? '#334155' : PURPLE,
        fontSize:       12,
        fontWeight:     700,
        fontFamily:     FONT,
        letterSpacing:  '0.06em',
        textTransform:  'uppercase',
        cursor:         isDisabled ? 'not-allowed' : 'pointer',
        transition:     'all 0.15s',
        whiteSpace:     'nowrap',
      }}
      onMouseEnter={e => {
        if (!isDisabled) {
          e.currentTarget.style.background = PURPLE;
          e.currentTarget.style.color = '#05080f';
        }
      }}
      onMouseLeave={e => {
        if (!isDisabled) {
          e.currentTarget.style.background = 'rgba(167,139,250,0.14)';
          e.currentTarget.style.color = PURPLE;
        }
      }}
    >
      <Download size={13} />
      Export Scanner-Ready CSV
      {count > 0 && (
        <span style={{
          background: 'rgba(255,255,255,0.10)',
          borderRadius: 10,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}
