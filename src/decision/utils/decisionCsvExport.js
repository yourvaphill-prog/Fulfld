/**
 * Decision Maker Finder CSV export utility.
 * Exports one scan result as a CSV file and triggers a browser download.
 * Mirrors the pattern established in src/catalog/utils/catalogCsvExport.js.
 * Multi-value fields are collapsed with ' | ' separators.
 */

export const DMF_COLUMNS = [
  'Brand Name',
  'Website',
  'Scanned At',
  'Contact Page',
  'About Page',
  'Wholesale Page',
  'Other Pages',
  'Emails',
  'Phones',
  'LinkedIn Company',
  'Other Socials',
  'People Found',
  'Best Person',
  'Best Person Title',
  'Best Person Source',
  'Best Person Confidence',
  'Best Person LinkedIn Search',
  'Best Person Google Search',
  'Fallback Target Roles',
  'LinkedIn Search Links',
  'Google Search Links',
  'Recommended Priority',
  'Confidence Score',
  'Confidence Label',
  'Suggested Action',
  'Suggested Call Script',
  'Notes',
];

/**
 * Export one Decision Maker Finder result to CSV and trigger a download.
 * @param {object} result - The full API response object.
 * @returns {string} The filename that was downloaded, or '' if nothing to export.
 */
export function exportDecisionMakerCSV(result) {
  if (!result) return '';

  const safeName = (result.brandName || 'brand')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'brand';
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_decision_makers_${date}.csv`;

  const linkedInSocial = (result.socialLinks || []).find(s => s.platform === 'LinkedIn');
  const otherSocials   = (result.socialLinks || []).filter(s => s.platform !== 'LinkedIn');
  const people         = result.peopleFound || [];
  const bestPerson     = people[0] || null;

  const row = {
    'Brand Name':                result.brandName        || '',
    'Website':                   result.websiteUrl       || '',
    'Scanned At':                result.scannedAt        || '',
    'Contact Page':              result.contactPageUrl   || '',
    'About Page':                result.aboutPageUrl     || '',
    'Wholesale Page':            result.wholesalePageUrl || '',
    'Other Pages':               (result.otherPageUrls   || []).join(' | '),
    'Emails':                    (result.emails          || []).map(e => e.value).join(' | '),
    'Phones':                    (result.phones          || []).map(p => p.value).join(' | '),
    'LinkedIn Company':          linkedInSocial?.url     || '',
    'Other Socials':             otherSocials.map(s => `${s.platform}: ${s.url}`).join(' | '),
    'People Found':              people.map(p => `${p.name} (${p.title})`).join(' | '),
    'Best Person':               bestPerson?.name        || '',
    'Best Person Title':         bestPerson?.title       || '',
    'Best Person Source':        bestPerson?.sourceUrl   || '',
    'Best Person Confidence':    bestPerson?.confidenceLabel || '',
    'Best Person LinkedIn Search': bestPerson?.linkedinSearchUrl || '',
    'Best Person Google Search': bestPerson?.googleSearchUrl  || '',
    'Fallback Target Roles':     (result.decisionMakerTargets || []).map(t => t.title).join(' | '),
    'LinkedIn Search Links':     (result.decisionMakerTargets || []).map(t => t.linkedinSearchUrl).join(' | '),
    'Google Search Links':       (result.decisionMakerTargets || []).map(t => t.googleSearchUrl).join(' | '),
    'Recommended Priority':      result.recommendedPriority || '',
    'Confidence Score':          result.confidenceScore != null ? String(result.confidenceScore) : '',
    'Confidence Label':          result.confidenceLabel  || '',
    'Suggested Action':          result.suggestedAction  || '',
    'Suggested Call Script':     result.suggestedCallScript || '',
    'Notes':                     result.notes            || '',
  };

  const csvLines = [
    DMF_COLUMNS.join(','),
    DMF_COLUMNS.map(col => JSON.stringify(String(row[col] ?? ''))).join(','),
  ];

  const csv  = csvLines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}
