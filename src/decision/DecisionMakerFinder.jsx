import { useState } from 'react';
import { Search, Download, ExternalLink, Phone, Mail, Globe, Users, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import { exportDecisionMakerCSV } from './utils/decisionCsvExport.js';

// ── Design tokens — matches App.jsx palette ───────────────────────────────────
const ACCENT = '#fb7185';           // rose — unique to this module
const G      = '#00ff87';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';
const FONT   = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Small reusable helpers (inline — no sub-component files in Phase 1) ───────
function SectionCard({ title, icon, children }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: '18px 20px',
      backdropFilter: 'blur(8px)', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ color: '#475569', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{
          color: '#64748b', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 5,
      background: `${color}18`, border: `1px solid ${color}35`,
      color, fontSize: 10, fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

function RowItem({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
    }}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DecisionMakerFinder() {
  const [brandName,  setBrandName]  = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [result,     setResult]     = useState(null);
  const [copied,     setCopied]     = useState(false);

  const canSubmit = brandName.trim().length > 0 && websiteUrl.trim().length > 0 && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/decision-maker-search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brandName:  brandName.trim(),
          websiteUrl: websiteUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status}).`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Network error — ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setBrandName('');
    setWebsiteUrl('');
  }

  function copyScript() {
    if (!result?.suggestedCallScript) return;
    if (!navigator.clipboard) {
      setCopied(false);
      return;
    }
    navigator.clipboard.writeText(result.suggestedCallScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard permission denied or unavailable — fail silently, no state change
      setCopied(false);
    });
  }

  const confidenceColor =
    result?.confidenceLabel === 'High'   ? '#00ff87' :
    result?.confidenceLabel === 'Medium' ? '#fbbf24' : '#ef4444';

  // ── Input field shared style ──────────────────────────────────────────────
  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: FONT,
    outline: 'none',
    boxSizing: 'border-box',
    opacity: loading ? 0.5 : 1,
  };

  const labelStyle = {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 8,
    fontFamily: FONT,
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'transparent', fontFamily: FONT }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* ── Module header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(251,113,133,0.12)',
              border: '1px solid rgba(251,113,133,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              🎯
            </div>
            <div>
              <h1 style={{
                color: '#e2e8f0', fontSize: 20, fontWeight: 700,
                margin: 0, letterSpacing: '0.02em',
              }}>
                Decision Maker Finder
              </h1>
              <div style={{ color: ACCENT, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', marginTop: 2 }}>
                Find the right contact at any brand — free, public data only
              </div>
            </div>
          </div>
          <p style={{ color: '#475569', fontSize: 12, margin: 0, lineHeight: 1.75 }}>
            Enter a brand name and website URL. This tool scans publicly available pages — contact, about,
            wholesale, and sales pages — to surface emails, phones, social links, and ranked decision maker targets.
            No paid APIs. No LinkedIn scraping. No private data.
          </p>
        </div>

        {/* ── Input form ── */}
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`,
          borderTop: `2px solid ${ACCENT}50`,
          borderRadius: 12, padding: '22px 24px',
          backdropFilter: 'blur(8px)', marginBottom: 20,
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Brand Name</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="e.g. Acme Outdoors"
                  disabled={loading}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Website URL</label>
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="e.g. acmeoutdoors.com"
                  disabled={loading}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  background: canSubmit ? ACCENT : 'rgba(251,113,133,0.12)',
                  border: `1px solid ${canSubmit ? ACCENT : 'rgba(251,113,133,0.25)'}`,
                  borderRadius: 8, padding: '10px 22px',
                  color: canSubmit ? '#05080f' : '#6b7280',
                  fontSize: 12, fontFamily: FONT,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                <Search size={13} />
                {loading ? 'Scanning…' : 'Find Decision Makers'}
              </button>
              {result && (
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    background: 'transparent', border: `1px solid ${BORDER}`,
                    borderRadius: 8, padding: '10px 16px', color: '#475569',
                    fontSize: 12, fontFamily: FONT, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <RefreshCw size={12} /> New Search
                </button>
              )}
            </div>
          </form>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '36px 24px',
            backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            marginBottom: 20,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `2px solid ${BORDER}`, borderTopColor: ACCENT,
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Scanning public pages…
              </div>
              <div style={{ color: '#475569', fontSize: 11 }}>
                Checking contact, about, and wholesale pages. This may take 10–20 seconds.
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {error && !loading && (
          <div style={{
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            marginBottom: 20,
          }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                Scan failed
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{error}</div>
            </div>
          </div>
        )}

        {/* ── Empty state (initial) ── */}
        {!result && !loading && !error && (
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '52px 24px',
            backdropFilter: 'blur(8px)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 38, marginBottom: 14 }}>🎯</div>
            <div style={{ color: '#475569', fontSize: 13, marginBottom: 6 }}>
              Enter a brand name and website URL above to begin
            </div>
            <div style={{ color: '#334155', fontSize: 11 }}>
              Scans public contact, about, wholesale, and sales pages — no paid APIs required
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <>
            {/* Summary bar */}
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 12, padding: '14px 18px',
              backdropFilter: 'blur(8px)', marginBottom: 14,
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>
                    {result.brandName}
                  </div>
                  <a
                    href={result.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#475569', fontSize: 11, textDecoration: 'none' }}
                  >
                    {result.websiteUrl}
                  </a>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Chip label={`${result.pagesScanned?.length || 0} pages scanned`} color="#475569" />
                  <Chip
                    label={`${result.peopleFound?.length || 0} ${result.peopleFound?.length === 1 ? 'person' : 'people'} found`}
                    color={result.peopleFound?.length ? ACCENT : '#334155'}
                  />
                  <Chip
                    label={`${result.emails?.length || 0} email${result.emails?.length !== 1 ? 's' : ''}`}
                    color={result.emails?.length ? G : '#334155'}
                  />
                  <Chip
                    label={`${result.phones?.length || 0} phone${result.phones?.length !== 1 ? 's' : ''}`}
                    color={result.phones?.length ? G : '#334155'}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  padding: '5px 12px', borderRadius: 20,
                  background: `${confidenceColor}15`,
                  border: `1px solid ${confidenceColor}40`,
                  color: confidenceColor, fontSize: 11, fontWeight: 700,
                }}>
                  {result.confidenceLabel} Confidence · {result.confidenceScore}/100
                </div>
                <button
                  onClick={() => exportDecisionMakerCSV(result)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
                    borderRadius: 8, padding: '7px 13px', color: '#94a3b8',
                    fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Download size={12} /> Export CSV
                </button>
              </div>
            </div>

            {/* Pages discovered */}
            {(result.contactPageUrl || result.aboutPageUrl || result.wholesalePageUrl || result.otherPageUrls?.length > 0) && (
              <SectionCard title="Pages Discovered" icon={<Globe size={13} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Contact Page',      url: result.contactPageUrl },
                    { label: 'About / Team',       url: result.aboutPageUrl },
                    { label: 'Wholesale / Sales',  url: result.wholesalePageUrl },
                    ...(result.otherPageUrls || []).map(u => ({ label: 'Other', url: u })),
                  ]
                    .filter(p => p.url)
                    .map((p, i) => (
                      <RowItem key={i}>
                        <span style={{ color: '#475569', fontSize: 11, minWidth: 130, flexShrink: 0 }}>
                          {p.label}
                        </span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: ACCENT, fontSize: 11, textDecoration: 'none',
                            display: 'flex', alignItems: 'center', gap: 4,
                            wordBreak: 'break-all',
                          }}
                        >
                          {p.url} <ExternalLink size={10} style={{ flexShrink: 0 }} />
                        </a>
                      </RowItem>
                    ))}
                </div>
              </SectionCard>
            )}

            {/* Emails */}
            {result.emails?.length > 0 && (
              <SectionCard title="Public Emails" icon={<Mail size={13} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.emails.map((e, i) => (
                    <RowItem key={i}>
                      <span style={{ color: '#e2e8f0', fontSize: 12 }}>{e.value}</span>
                      <span style={{ color: '#334155', fontSize: 10 }}>
                        {(e.sourceUrl || '').replace(/^https?:\/\//, '').split('/')[0]}
                      </span>
                    </RowItem>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Phones */}
            {result.phones?.length > 0 && (
              <SectionCard title="Public Phone Numbers" icon={<Phone size={13} />}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.phones.map((p, i) => (
                    <div key={i} style={{
                      padding: '8px 16px',
                      background: 'rgba(0,255,135,0.06)',
                      border: '1px solid rgba(0,255,135,0.22)',
                      borderRadius: 8,
                    }}>
                      <span style={{ color: G, fontSize: 13, fontWeight: 600 }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Social links */}
            {result.socialLinks?.length > 0 && (
              <SectionCard title="Social Links" icon={<Users size={13} />}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.socialLinks.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '7px 14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 8,
                        color: '#94a3b8', fontSize: 12, textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      {s.platform} <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ── People Found ── */}
            {result.peopleFound?.length > 0 && (
              <SectionCard title="People Found" icon={<Users size={13} />}>
                <div style={{
                  color: '#475569', fontSize: 11, marginBottom: 12, lineHeight: 1.5,
                }}>
                  Extracted from public pages. Verify before contacting. Search links are generated — not verified profiles.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['#', 'Name', 'Title', 'Source', 'Email', 'Phone', 'Phone Type', 'LinkedIn Search', 'Google Search', 'Confidence'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', color: '#475569',
                            fontSize: 9, fontWeight: 600,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '0 8px 10px 0',
                            borderBottom: `1px solid ${BORDER}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.peopleFound.map((p, i) => {
                        const confColor =
                          p.confidenceLabel === 'High'   ? '#00ff87' :
                          p.confidenceLabel === 'Medium' ? '#fbbf24' : '#ef4444';
                        const sourceHost = (p.sourceUrl || '').replace(/^https?:\/\//, '').split('/')[0];
                        const sourcePath = (p.sourceUrl || '').replace(/^https?:\/\/[^/]+/, '') || '/';
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: '9px 8px 9px 0', color: '#475569', fontSize: 10 }}>{i + 1}</td>
                            <td style={{ padding: '9px 8px 9px 0' }}>
                              <span style={{ color: '#e2e8f0', fontWeight: i === 0 ? 700 : 500 }}>
                                {p.name}
                              </span>
                              {i === 0 && (
                                <span style={{
                                  marginLeft: 7, fontSize: 8, color: ACCENT,
                                  border: `1px solid ${ACCENT}40`, borderRadius: 4,
                                  padding: '1px 5px', verticalAlign: 'middle',
                                }}>
                                  BEST MATCH
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '9px 8px 9px 0', color: '#94a3b8' }}>{p.title}</td>
                            <td style={{ padding: '9px 8px 9px 0' }}>
                              <a
                                href={p.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={p.sourceUrl}
                                style={{ color: '#475569', fontSize: 10, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                {sourcePath.length > 18 ? sourcePath.slice(0, 18) + '…' : sourcePath}
                                <ExternalLink size={8} style={{ flexShrink: 0 }} />
                              </a>
                            </td>
                            <td style={{ padding: '9px 8px 9px 0' }}>
                              {p.email
                                ? <a href={`mailto:${p.email}`} style={{ color: G, fontSize: 10, textDecoration: 'none' }}>{p.email}</a>
                                : <span style={{ color: '#334155', fontSize: 10 }}>—</span>
                              }
                            </td>
                            <td style={{ padding: '9px 8px 9px 0', color: p.phone ? G : '#334155', fontSize: 10, whiteSpace: 'nowrap' }}>
                              {p.phone || '—'}
                            </td>
                            <td style={{ padding: '9px 8px 9px 0', color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>
                              {p.phoneType || '—'}
                            </td>
                            <td style={{ padding: '9px 8px 9px 0' }}>
                              <a
                                href={p.linkedinSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3b82f6', fontSize: 10, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
                              >
                                Search LinkedIn <ExternalLink size={8} />
                              </a>
                            </td>
                            <td style={{ padding: '9px 8px 9px 0' }}>
                              <a
                                href={p.googleSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#64748b', fontSize: 10, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
                              >
                                Search Google <ExternalLink size={8} />
                              </a>
                            </td>
                            <td style={{ padding: '9px 0' }}>
                              <span style={{
                                padding: '2px 7px', borderRadius: 4,
                                background: `${confColor}15`,
                                border: `1px solid ${confColor}35`,
                                color: confColor, fontSize: 9, fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}>
                                {p.confidenceLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* ── Fallback Target Roles ── */}
            {result.decisionMakerTargets?.length > 0 && (
              <SectionCard title="Fallback Target Roles" icon={<Search size={13} />}>
                <div style={{
                  color: '#475569', fontSize: 11, marginBottom: 12, lineHeight: 1.5,
                }}>
                  Generated search links for target roles — not verified person profiles.
                  {result.peopleFound?.length > 0
                    ? ' Use these to supplement the people found above.'
                    : ' Use these if no real people were found above.'}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['#', 'Role', 'LinkedIn Search', 'Google Search'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', color: '#475569',
                            fontSize: 10, fontWeight: 600,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '0 8px 10px 0',
                            borderBottom: `1px solid ${BORDER}`,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.decisionMakerTargets.map((t, i) => (
                        <tr key={i}>
                          <td style={{ padding: '9px 8px 9px 0', color: '#334155', fontSize: 11 }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: '9px 8px 9px 0' }}>
                            <span style={{
                              color: i === 0 ? '#e2e8f0' : '#94a3b8',
                              fontWeight: i === 0 ? 700 : 400,
                            }}>
                              {t.title}
                            </span>
                            {i === 0 && (
                              <span style={{
                                marginLeft: 8, fontSize: 9, color: ACCENT,
                                border: `1px solid ${ACCENT}40`, borderRadius: 4,
                                padding: '1px 5px', verticalAlign: 'middle',
                              }}>
                                TOP PICK
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '9px 8px 9px 0' }}>
                            <a
                              href={t.linkedinSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#3b82f6', fontSize: 11, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              Search LinkedIn <ExternalLink size={9} />
                            </a>
                          </td>
                          <td style={{ padding: '9px 0' }}>
                            <a
                              href={t.googleSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#64748b', fontSize: 11, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              Search Google <ExternalLink size={9} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Caller strategy */}
            <SectionCard title="Caller Strategy" icon={<Phone size={13} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Recommended priority + confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#475569', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Recommended Priority
                    </div>
                    <div style={{ color: ACCENT, fontSize: 15, fontWeight: 700 }}>
                      {result.recommendedPriority}
                    </div>
                  </div>
                </div>

                {/* Suggested action */}
                <div>
                  <div style={{ color: '#475569', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Suggested Action
                  </div>
                  <div style={{
                    color: '#e2e8f0', fontSize: 13, lineHeight: 1.65,
                    padding: '10px 14px',
                    background: 'rgba(251,113,133,0.06)',
                    border: `1px solid rgba(251,113,133,0.18)`,
                    borderRadius: 8,
                  }}>
                    {result.suggestedAction}
                  </div>
                </div>

                {/* Call script */}
                {result.suggestedCallScript && (
                  <div>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 6,
                    }}>
                      <div style={{ color: '#475569', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Suggested Call Script
                      </div>
                      <button
                        onClick={copyScript}
                        style={{
                          background: 'transparent', border: `1px solid ${BORDER}`,
                          borderRadius: 6, padding: '3px 10px',
                          color: copied ? G : '#475569',
                          fontSize: 10, fontFamily: FONT, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Copy size={10} />
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${BORDER}`,
                      borderLeft: `3px solid ${ACCENT}`,
                      borderRadius: '0 8px 8px 0',
                      padding: '12px 16px',
                      color: '#94a3b8', fontSize: 12, lineHeight: 1.75,
                      fontStyle: 'italic',
                    }}>
                      {result.suggestedCallScript}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {result.notes && (
                  <div style={{
                    borderTop: `1px solid ${BORDER}`, paddingTop: 12,
                    color: '#475569', fontSize: 11, lineHeight: 1.65,
                  }}>
                    <span style={{ color: '#334155', fontWeight: 600 }}>Notes: </span>
                    {result.notes}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Limitations notice */}
            <div style={{
              background: 'rgba(255,255,255,0.015)', border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '11px 15px', marginTop: 4,
              display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
              <AlertCircle size={12} color="#334155" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#334155', fontSize: 11, lineHeight: 1.65 }}>
                This tool surfaces publicly available contact information only. No private, login-gated,
                or LinkedIn profile data is accessed or returned. Always comply with applicable privacy
                laws (CAN-SPAM, GDPR, CCPA) and your organization's outreach policies before contacting anyone.
              </span>
            </div>
          </>
        )}
      </div>

      {/* Spin animation — mirrors App.jsx global style */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
