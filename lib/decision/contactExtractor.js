/**
 * Contact extractor for Decision Maker Finder.
 * Extracts emails, phone numbers, social links, and real people from fetched page HTML.
 * People extraction uses JSON-LD Person objects and structured HTML name/title patterns.
 * No names are invented — every person record requires a valid name + a matched title keyword.
 */

// ── People extraction constants ───────────────────────────────────────────────

/**
 * Decision-maker title keywords ordered longest-first within each tier
 * so that more specific phrases match before shorter substrings.
 */
const PERSON_TITLE_KEYWORDS = [
  { tier: 1, points: 100, keyword: 'chief executive officer', label: 'Chief Executive Officer' },
  { tier: 1, points: 100, keyword: 'chief executive',         label: 'Chief Executive'         },
  { tier: 1, points: 100, keyword: 'co-founder',              label: 'Co-Founder'              },
  { tier: 1, points: 100, keyword: 'cofounder',               label: 'Co-Founder'              },
  { tier: 1, points: 100, keyword: 'founder',                 label: 'Founder'                 },
  { tier: 1, points: 100, keyword: 'co-owner',                label: 'Co-Owner'                },
  { tier: 1, points: 100, keyword: 'owner',                   label: 'Owner'                   },
  { tier: 1, points: 100, keyword: 'ceo',                     label: 'CEO'                     },
  { tier: 2, points:  80, keyword: 'general manager',         label: 'General Manager'         },
  { tier: 2, points:  80, keyword: 'managing director',       label: 'Managing Director'       },
  { tier: 2, points:  80, keyword: 'president',               label: 'President'               },
  { tier: 3, points:  70, keyword: 'vice president of sales', label: 'VP of Sales'             },
  { tier: 3, points:  70, keyword: 'vp of sales',             label: 'VP of Sales'             },
  { tier: 3, points:  70, keyword: 'vp sales',                label: 'VP Sales'                },
  { tier: 3, points:  70, keyword: 'national sales manager',  label: 'National Sales Manager'  },
  { tier: 3, points:  70, keyword: 'director of sales',       label: 'Director of Sales'       },
  { tier: 3, points:  70, keyword: 'sales director',          label: 'Sales Director'          },
  { tier: 3, points:  70, keyword: 'head of sales',           label: 'Head of Sales'           },
  { tier: 3, points:  70, keyword: 'regional sales manager',  label: 'Regional Sales Manager'  },
  { tier: 3, points:  70, keyword: 'sales manager',           label: 'Sales Manager'           },
  { tier: 4, points:  60, keyword: 'director of ecommerce',   label: 'Director of Ecommerce'   },
  { tier: 4, points:  60, keyword: 'ecommerce director',      label: 'Ecommerce Director'      },
  { tier: 4, points:  60, keyword: 'vp of ecommerce',         label: 'VP of Ecommerce'         },
  { tier: 4, points:  60, keyword: 'vp ecommerce',            label: 'VP Ecommerce'            },
  { tier: 4, points:  60, keyword: 'marketplace director',    label: 'Marketplace Director'    },
  { tier: 4, points:  60, keyword: 'marketplace manager',     label: 'Marketplace Manager'     },
  { tier: 4, points:  60, keyword: 'amazon director',         label: 'Amazon Director'         },
  { tier: 4, points:  60, keyword: 'amazon manager',          label: 'Amazon Manager'          },
  { tier: 4, points:  60, keyword: 'head of ecommerce',       label: 'Head of Ecommerce'       },
  { tier: 4, points:  60, keyword: 'online channel manager',  label: 'Online Channel Manager'  },
  { tier: 4, points:  60, keyword: 'digital commerce',        label: 'Digital Commerce'        },
  { tier: 5, points:  50, keyword: 'national account manager',label: 'National Account Manager'},
  { tier: 5, points:  50, keyword: 'key account manager',     label: 'Key Account Manager'     },
  { tier: 5, points:  50, keyword: 'wholesale director',      label: 'Wholesale Director'      },
  { tier: 5, points:  50, keyword: 'wholesale manager',       label: 'Wholesale Manager'       },
  { tier: 5, points:  50, keyword: 'partnerships manager',    label: 'Partnerships Manager'    },
  { tier: 5, points:  50, keyword: 'channel manager',         label: 'Channel Manager'         },
  { tier: 5, points:  50, keyword: 'business development',    label: 'Business Development'    },
  { tier: 5, points:  50, keyword: 'trade sales',             label: 'Trade Sales'             },
  { tier: 5, points:  50, keyword: 'account executive',       label: 'Account Executive'       },
  { tier: 5, points:  50, keyword: 'sales representative',    label: 'Sales Representative'    },
  { tier: 6, points:  35, keyword: 'director of operations',  label: 'Director of Operations'  },
  { tier: 6, points:  35, keyword: 'operations director',     label: 'Operations Director'     },
  { tier: 6, points:  35, keyword: 'operations manager',      label: 'Operations Manager'      },
  { tier: 6, points:  35, keyword: 'supply chain',            label: 'Supply Chain'            },
  { tier: 6, points:  35, keyword: 'fulfillment manager',     label: 'Fulfillment Manager'     },
  { tier: 7, points:  20, keyword: 'customer success',        label: 'Customer Success'        },
  { tier: 7, points:  20, keyword: 'customer service',        label: 'Customer Service'        },
  { tier: 7, points:  20, keyword: 'customer support',        label: 'Customer Support'        },
];

// Tokens that must not appear as the first or last word of a person name
const NAME_BLOCKLIST = new Set([
  'about', 'contact', 'team', 'home', 'shop', 'store', 'blog', 'news', 'press',
  'learn', 'more', 'view', 'read', 'see', 'get', 'buy', 'find', 'sign', 'log',
  'new', 'free', 'sale', 'deal', 'now', 'all', 'our', 'your', 'their', 'they',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'inc', 'llc', 'ltd', 'corp', 'company', 'brand', 'product',
  'customer', 'service', 'support', 'sales', 'marketing', 'privacy', 'terms',
  'united', 'states', 'north', 'south', 'east', 'west', 'central',
  'location', 'address', 'directions', 'hours', 'open', 'close', 'closed',
  'login', 'logout', 'register', 'subscribe', 'newsletter',
  'shipping', 'returns', 'checkout', 'cart', 'order', 'track', 'delivery',
  'wholesale', 'retail', 'trade', 'partner', 'partners', 'apply',
  'follow', 'share', 'like', 'post', 'tweet', 'connect', 'join',
  'click', 'here', 'link', 'back', 'next', 'prev', 'previous', 'done',
  'welcome', 'hello', 'thank', 'thanks', 'sorry', 'please',
  'featured', 'latest', 'recent', 'popular', 'related', 'other',
]);

// ── Shared email / phone / social constants ───────────────────────────────────

const EMAIL_BLOCKLIST = [
  'sentry', 'example.com', 'yourname', '.png', '.jpg', '.gif', '.svg',
  'schema.org', 'w3.org', 'openxmlformats', 'wixpress.com', 'jquery',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
];

const SOCIAL_PLATFORMS = [
  { platform: 'LinkedIn',  re: /linkedin\.com\/company\/[^\s"'?#<>]+/i },
  { platform: 'Instagram', re: /instagram\.com\/(?!p\/|reel\/|explore\/)[^\s"'?#<>]+/i },
  { platform: 'Facebook',  re: /facebook\.com\/(?!sharer|share|dialog|tr\/)[^\s"'?#<>]+/i },
  { platform: 'Twitter/X', re: /(?:twitter|x)\.com\/(?!intent\/|share\?)[^\s"'?#<>]+/i },
  { platform: 'YouTube',   re: /youtube\.com\/(?:c\/|channel\/|@|user\/)[^\s"'?#<>]+/i },
  { platform: 'TikTok',    re: /tiktok\.com\/@[^\s"'?#<>]+/i },
  { platform: 'Pinterest', re: /pinterest\.com\/[^\s"'?#<>]+/i },
];

// ── Shared low-level helpers ──────────────────────────────────────────────────

function isValidEmail(email) {
  if (!email || !email.includes('@')) return false;
  if (EMAIL_BLOCKLIST.some(b => email.includes(b))) return false;
  if (!/\.[a-zA-Z]{2,}$/.test(email)) return false;
  return true;
}

function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (core.length !== 10) return null;
  return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
}

function extractEmailsFromText(text) {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0].toLowerCase());
  return out;
}

function extractMailtoEmails(html) {
  const re = /href\s*=\s*["']mailto:([^"'?\s]+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].toLowerCase().trim());
  return out;
}

function extractTelNumbers(html) {
  const re = /href\s*=\s*["']tel:([^"'\s]+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function extractTextPhones(html) {
  // Strip all HTML tags so the phone regex only sees visible text content.
  // Numeric strings in data-* attributes, id values, and inline scripts are
  // excluded this way, preventing product IDs and timestamps from matching.
  const text = html.replace(/<[^>]+>/g, ' ');
  const re = /(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out;
}

function extractSocialHrefs(html) {
  const re = /href\s*=\s*["'](https?:\/\/[^"']+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function matchSocialPlatforms(href) {
  const results = [];
  for (const { platform, re } of SOCIAL_PLATFORMS) {
    const m = re.exec(href);
    if (m) {
      const raw = m[0];
      const url = raw.startsWith('http') ? raw : 'https://' + raw;
      results.push({ platform, url });
    }
  }
  return results;
}

// ── People extraction helpers ─────────────────────────────────────────────────

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

/**
 * Returns true only if str looks like a real 2–4 token person name.
 * Every token must start with a capital letter and contain only letters/hyphens/apostrophes.
 * Blocklisted tokens at the start or end reject the candidate.
 */
function isValidName(str) {
  const s = cleanStr(str);
  if (!s) return false;
  const tokens = s.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  for (const t of tokens) {
    if (t.length < 2 || t.length > 30) return false;
    if (!/^[A-ZÀ-Ö][a-zA-ZÀ-ÿ'\-]*$/.test(t)) return false;
  }
  if (/\d/.test(s)) return false;
  if (NAME_BLOCKLIST.has(tokens[0].toLowerCase())) return false;
  if (NAME_BLOCKLIST.has(tokens[tokens.length - 1].toLowerCase())) return false;
  return true;
}

/** Returns the first matching title keyword entry, or null. */
function matchTitleKeyword(text) {
  const lower = (text || '').toLowerCase();
  for (const kw of PERSON_TITLE_KEYWORDS) {
    if (lower.includes(kw.keyword)) return kw;
  }
  return null;
}

function computePersonConfidence({ sourceType, pageType, hasEmail, hasPhone, tier }) {
  let score = 0;
  if (sourceType === 'json-ld')           score += 50;
  else if (sourceType === 'html-pattern') score += 30;
  if (pageType === 'about')               score += 20;
  else if (pageType === 'contact')        score += 12;
  else if (pageType === 'wholesale')      score += 12;
  else if (pageType === 'ecommerce')      score += 10;
  else if (pageType === 'homepage')       score +=  5;
  if (hasEmail) score += 10;
  if (hasPhone) score +=  5;
  if (tier <= 2) score += 10;
  else if (tier <= 5) score += 5;
  return Math.min(score, 100);
}

function classifyPhoneType(pageType) {
  if (pageType === 'contact')   return 'Contact Page Phone';
  if (pageType === 'wholesale') return 'Sales Phone';
  if (pageType === 'about')     return 'Company Phone';
  if (pageType === 'homepage')  return 'Company HQ Phone';
  return 'Needs Verification';
}

// ── HTML → plain-text lines ───────────────────────────────────────────────────

function htmlToLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<\/(?:h[1-6]|p|div|li|td|th|br|tr|article|section|strong|b|em|span|small)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 1 && l.length < 200);
}

// ── JSON-LD person extraction ─────────────────────────────────────────────────

function walkJsonLdForPeople(obj, out, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return;
  const type = obj['@type'];
  if (type === 'Person' || type === 'Employee') {
    out.push(obj);
    return;
  }
  for (const key of ['employee', 'employees', 'member', 'members', 'founder', 'founders', 'author', 'creator', 'accountablePerson']) {
    const val = obj[key];
    if (!val) continue;
    const arr = Array.isArray(val) ? val : [val];
    for (const item of arr) {
      if (typeof item === 'object') walkJsonLdForPeople(item, out, depth + 1);
    }
  }
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) walkJsonLdForPeople(item, out, depth + 1);
  }
}

function extractFromJsonLd(html, sourceUrl, pageType) {
  const results = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let obj;
    try { obj = JSON.parse(m[1].trim()); } catch { continue; }
    const candidates = [];
    walkJsonLdForPeople(obj, candidates);
    for (const c of candidates) {
      const name  = cleanStr(c.name || '');
      const title = cleanStr(c.jobTitle || c.title || '');
      if (!isValidName(name)) continue;
      const match = matchTitleKeyword(title);
      if (!match) continue; // require a recognized decision-maker title
      const email = cleanStr(c.email || '').toLowerCase();
      const phone = normalizePhone(cleanStr(c.telephone || '')) || '';
      const tier  = match.tier;
      const score = computePersonConfidence({ sourceType: 'json-ld', pageType, hasEmail: isValidEmail(email), hasPhone: !!phone, tier });
      results.push({
        name,
        title:           match.label,
        sourceUrl,
        sourceType:      'json-ld',
        email:           isValidEmail(email) ? email : '',
        phone,
        phoneType:       phone ? classifyPhoneType(pageType) : '',
        tier,
        tierPoints:      match.points,
        confidenceScore: score,
        confidenceLabel: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
      });
    }
  }
  return results;
}

// ── Structured HTML name/title proximity extraction ───────────────────────────

function extractFromStructuredHtml(html, sourceUrl, pageType) {
  const lines   = htmlToLines(html);
  const results = [];
  const seen    = new Set();
  const WINDOW  = 4; // lines either side of a name candidate

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isValidName(line)) continue;

    for (let j = Math.max(0, i - WINDOW); j <= Math.min(lines.length - 1, i + WINDOW); j++) {
      if (j === i) continue;
      const adjacent = lines[j];
      if (adjacent.length > 120) continue; // too long to be a bare job title
      const match = matchTitleKeyword(adjacent);
      if (!match) continue;

      const key = `${line.toLowerCase()}|${match.tier}`;
      if (seen.has(key)) break;
      seen.add(key);

      // Scan the same line window for a personal email or phone.
      // Deliberately restricted to the same ±WINDOW lines used for name/title
      // detection to prevent attributing another person's contact info.
      let blockEmail = '';
      let blockPhone = '';
      const lo = Math.max(0, i - WINDOW);
      const hi = Math.min(lines.length - 1, i + WINDOW);
      for (let k = lo; k <= hi; k++) {
        if (!blockEmail) {
          const found = extractEmailsFromText(lines[k])
            .filter(e => isValidEmail(e) && !e.startsWith('info@') && !e.startsWith('contact@') && !e.startsWith('hello@') && !e.startsWith('support@'));
          if (found.length) blockEmail = found[0];
        }
        if (!blockPhone) {
          const found = extractTextPhones(lines[k]).map(normalizePhone).filter(Boolean);
          if (found.length) blockPhone = found[0];
        }
        if (blockEmail && blockPhone) break;
      }

      const score = computePersonConfidence({ sourceType: 'html-pattern', pageType, hasEmail: !!blockEmail, hasPhone: !!blockPhone, tier: match.tier });
      results.push({
        name:            line,
        title:           match.label,
        sourceUrl,
        sourceType:      'html-pattern',
        email:           blockEmail,
        phone:           blockPhone,
        phoneType:       blockPhone ? classifyPhoneType(pageType) : '',
        tier:            match.tier,
        tierPoints:      match.points,
        confidenceScore: score,
        confidenceLabel: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low',
      });
      break;
    }
  }
  return results;
}

// ── Near-contact lookup (find email/phone within a character window of a name) ─

function findNearEmail(html, name) {
  const idx = html.toLowerCase().indexOf(name.toLowerCase());
  if (idx === -1) return '';
  const slice = html.slice(Math.max(0, idx - 600), idx + name.length + 600);
  const all   = [...extractEmailsFromText(slice), ...extractMailtoEmails(slice)].filter(isValidEmail);
  return (
    all.find(e => !e.startsWith('info@') && !e.startsWith('contact@') && !e.startsWith('hello@') && !e.startsWith('support@')) ||
    all[0] ||
    ''
  );
}

function findNearPhone(html, name) {
  const idx = html.toLowerCase().indexOf(name.toLowerCase());
  if (idx === -1) return '';
  const slice = html.slice(Math.max(0, idx - 600), idx + name.length + 600);
  return [...extractTelNumbers(slice), ...extractTextPhones(slice)].map(normalizePhone).filter(Boolean)[0] || '';
}

// ── Main people extractor ─────────────────────────────────────────────────────

/**
 * Extract real people from already-fetched pages.
 * Returns up to 10 person records, sorted by tier then confidence.
 * No names are invented — every record requires a valid name + matched title keyword.
 *
 * @param {Array<{url, type, html}>} fetchedPages
 * @param {string} brandName - used to reject false-positive names that are the brand itself
 * @returns {PersonRecord[]}
 */
export function extractPeople(fetchedPages, brandName = '') {
  const all        = [];
  const seen       = new Set();
  const brandLower = brandName.trim().toLowerCase();

  for (const page of fetchedPages) {
    if (!page.html) continue;
    const { url: sourceUrl, html, type: pageType = 'unknown' } = page;

    const candidates = [
      ...extractFromJsonLd(html, sourceUrl, pageType),
      ...extractFromStructuredHtml(html, sourceUrl, pageType),
    ];

    for (const p of candidates) {
      // Reject if the candidate name contains the brand name (common false positive)
      if (brandLower && p.name.toLowerCase().includes(brandLower)) continue;

      const key = `${p.name.toLowerCase()}|${p.tier}`;
      if (seen.has(key)) continue;
      seen.add(key);

      all.push(p);
    }
  }

  // Higher-priority tier first; within same tier, higher confidence first
  all.sort((a, b) => a.tier - b.tier || b.confidenceScore - a.confidenceScore);
  return all.slice(0, 10);
}

// ── Main contacts extractor ───────────────────────────────────────────────────

/**
 * Extract emails, phones, and social links from already-fetched pages.
 * Returns { emails, phones, socialLinks }.
 * People extraction is intentionally excluded here — decisionMakerRanker
 * calls extractPeople() directly so it can pass the brand name for filtering.
 */
export function extractContacts(fetchedPages) {
  const emailMap  = new Map();
  const phoneMap  = new Map();
  const socialMap = new Map();
  const now       = new Date().toISOString();

  for (const page of fetchedPages) {
    const { url: sourceUrl, html } = page;
    if (!html) continue;

    // Strip <script> and <style> blocks before any text-pattern scanning to prevent
    // JS bundle numeric strings (product IDs, zip codes, dimensions) from being
    // matched as email addresses or phone numbers.
    const htmlNoScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');

    // ── Emails ──────────────────────────────────────────────────────────────
    // mailto: hrefs are in markup (safe on raw html); free-text scan uses stripped version.
    for (const val of [...extractEmailsFromText(htmlNoScripts), ...extractMailtoEmails(html)]) {
      if (isValidEmail(val) && !emailMap.has(val)) {
        emailMap.set(val, { value: val, sourceUrl, foundAt: now });
      }
    }

    // ── Phones ──────────────────────────────────────────────────────────────
    // tel: hrefs are in markup (safe on raw html); text phone regex uses stripped version.
    for (const raw of [...extractTelNumbers(html), ...extractTextPhones(htmlNoScripts)]) {
      const norm = normalizePhone(raw);
      if (norm && !phoneMap.has(norm)) {
        phoneMap.set(norm, { value: norm, sourceUrl, foundAt: now });
      }
    }

    // ── Social links ─────────────────────────────────────────────────────────
    for (const href of extractSocialHrefs(html)) {
      for (const { platform, url } of matchSocialPlatforms(href)) {
        if (!socialMap.has(platform)) {
          socialMap.set(platform, { platform, url, sourceUrl, foundAt: now });
        }
      }
    }
  }

  return {
    emails:      [...emailMap.values()],
    phones:      [...phoneMap.values()],
    socialLinks: [...socialMap.values()],
  };
}
