/**
 * Website scanner for Decision Maker Finder.
 * Fetches homepage, discovers prioritized pages by slug pattern,
 * and returns a page map with raw HTML for internal processing.
 *
 * Hard limits:
 *   - Max 6 pages total (1 homepage + up to 5 additional)
 *   - 500,000 character cap per page HTML body
 *   - 20-second overall wall-clock budget
 */

import { safeFetch, normalizeUrl, isUrlSafe } from '../catalog/urlUtils.js';

const SLUG_GROUPS = {
  contact: [
    'contact', 'contact-us', 'contactus', 'get-in-touch', 'reach-us', 'reach-out',
  ],
  about: [
    'about', 'about-us', 'aboutus', 'our-story', 'team', 'our-team', 'meet-the-team',
    'leadership', 'management', 'staff', 'people', 'meet-us',
    'founder', 'founders', 'executive-team', 'executives', 'board', 'our-people',
  ],
  wholesale: [
    'wholesale', 'wholesale-inquiry', 'wholesale-application', 'trade', 'b2b',
    'become-a-retailer', 'become-a-partner', 'retailers', 'retail', 'distributors',
    'distributor', 'stockists', 'stockist', 'sell-with-us', 'work-with-us', 'vendor',
    'apply', 'partners', 'partnership', 'reseller', 'resellers', 'sales',
  ],
  ecommerce: [
    'amazon', 'marketplace', 'ecommerce', 'e-commerce', 'shop-with-us', 'online-store',
  ],
};

const PRIORITY_ORDER = ['contact', 'about', 'wholesale', 'ecommerce'];

function extractHrefs(html, baseUrl) {
  const hrefs = new Set();
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || m[2] || '').trim();
    if (
      !raw ||
      raw.startsWith('#') ||
      raw.startsWith('javascript:') ||
      raw.startsWith('mailto:') ||
      raw.startsWith('tel:') ||
      raw.startsWith('data:')
    ) continue;
    try {
      const resolved = new URL(raw, baseUrl).href;
      hrefs.add(resolved);
    } catch { /* unparseable — skip */ }
  }
  return [...hrefs];
}

function classifyLinks(links, baseOrigin) {
  const groups = { contact: [], about: [], wholesale: [], ecommerce: [] };
  for (const link of links) {
    let parsed;
    try { parsed = new URL(link); } catch { continue; }
    if (parsed.origin !== baseOrigin) continue;
    const path = parsed.pathname.toLowerCase();
    for (const [group, slugs] of Object.entries(SLUG_GROUPS)) {
      if (slugs.some(s => path === `/${s}` || path === `/${s}/` || path.includes(`/${s}/`) || path.includes(`/${s}-`) || path.endsWith(`/${s}`))) {
        if (!groups[group].includes(link)) groups[group].push(link);
        break;
      }
    }
  }
  return groups;
}

export async function scanWebsite(websiteUrl) {
  const normalized = normalizeUrl(websiteUrl);
  if (!normalized || !isUrlSafe(normalized)) {
    return { error: 'Invalid or unsafe URL.', fetchedPages: [], pagesScanned: [] };
  }

  const overallDeadline = Date.now() + 20_000;

  const homeResult = await safeFetch(normalized, { timeoutMs: 10_000 });
  if (!homeResult.ok || !homeResult.text) {
    return {
      error: `Could not fetch homepage (HTTP ${homeResult.status || 0}).`,
      homepageUrl: normalized,
      fetchedPages: [{ url: normalized, type: 'homepage', status: homeResult.status || 0, html: '' }],
      pagesScanned: [{ url: normalized, type: 'homepage', status: homeResult.status || 0 }],
    };
  }

  const homepageUrl = homeResult.url || normalized;
  const homeHtml    = (homeResult.text || '').slice(0, 500_000);
  const fetchedPages = [{ url: homepageUrl, type: 'homepage', status: homeResult.status, html: homeHtml }];

  const baseOrigin = (() => {
    try { return new URL(homepageUrl).origin; } catch { return new URL(normalized).origin; }
  })();

  const allLinks = extractHrefs(homeHtml, homepageUrl);
  const grouped  = classifyLinks(allLinks, baseOrigin);

  const seen  = new Set([homepageUrl]);
  const queue = [];
  for (const group of PRIORITY_ORDER) {
    for (const link of grouped[group]) {
      if (!seen.has(link) && queue.length < 5) {
        seen.add(link);
        queue.push({ url: link, type: group });
      }
    }
  }

  if (queue.length > 0) {
    const remaining      = Math.max(0, overallDeadline - Date.now());
    const perPageTimeout = Math.min(10_000, Math.max(3_000, Math.floor(remaining / queue.length)));

    const settled = await Promise.allSettled(
      queue.map(({ url, type }) =>
        safeFetch(url, { timeoutMs: perPageTimeout }).then(r => ({ url, type, result: r }))
      )
    );

    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      const { url, type, result } = item.value;
      if (!result.ok) continue;
      const html = (result.text || '').slice(0, 500_000);
      fetchedPages.push({ url: result.url || url, type, status: result.status, html });
    }
  }

  const typeMap = { contact: null, about: null, wholesale: null };
  const otherPageUrls = [];
  for (const p of fetchedPages) {
    if (p.type === 'homepage') continue;
    if (p.type === 'ecommerce') {
      otherPageUrls.push(p.url);
    } else if (!typeMap[p.type]) {
      typeMap[p.type] = p.url;
    }
  }

  return {
    homepageUrl,
    contactPageUrl:   typeMap.contact,
    aboutPageUrl:     typeMap.about,
    wholesalePageUrl: typeMap.wholesale,
    otherPageUrls,
    pagesScanned: fetchedPages.map(p => ({ url: p.url, type: p.type, status: p.status })),
    fetchedPages,
  };
}
