/**
 * Contact extractor for Decision Maker Finder.
 * Extracts emails, phone numbers, and social links from fetched page HTML.
 * Every result includes value, sourceUrl, and foundAt timestamp.
 */

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

function extractEmailsFromText(html) {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0].toLowerCase());
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
  // Strip href content first to avoid double-counting tel: links
  const stripped = html.replace(/href\s*=\s*["'][^"']*["']/gi, '');
  const re = /(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g;
  const out = [];
  let m;
  while ((m = re.exec(stripped)) !== null) out.push(m[0]);
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

export function extractContacts(fetchedPages) {
  const emailMap  = new Map();
  const phoneMap  = new Map();
  const socialMap = new Map();
  const now = new Date().toISOString();

  for (const page of fetchedPages) {
    const { url: sourceUrl, html } = page;
    if (!html) continue;

    // ── Emails ──────────────────────────────────────────────────────────────
    const allEmails = [
      ...extractEmailsFromText(html),
      ...extractMailtoEmails(html),
    ];
    for (const val of allEmails) {
      if (isValidEmail(val) && !emailMap.has(val)) {
        emailMap.set(val, { value: val, sourceUrl, foundAt: now });
      }
    }

    // ── Phones ──────────────────────────────────────────────────────────────
    const allPhones = [
      ...extractTelNumbers(html),
      ...extractTextPhones(html),
    ];
    for (const raw of allPhones) {
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
