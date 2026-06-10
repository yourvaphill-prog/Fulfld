/**
 * URL utilities for the catalog scraper.
 * Normalizes URLs, extracts base domain, and provides a safe fetch wrapper.
 *
 * SSRF Protection: safeFetch blocks requests to private/internal IP ranges,
 * loopback addresses, link-local ranges, and non-http(s) protocols to prevent
 * server-side request forgery via user-supplied URLs.
 */

/** Strip path/query/hash from a URL and return the clean origin. */
export function getBaseUrl(rawUrl) {
  try {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const parsed = new URL(url);
    return parsed.origin; // e.g. https://brand.com
  } catch {
    return null;
  }
}

/** Normalize a user-entered URL (add https if missing, return full href). */
export function normalizeUrl(rawUrl) {
  try {
    let url = (rawUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return new URL(url).href;
  } catch {
    return null;
  }
}

/**
 * SSRF guard — returns true when the URL is safe to fetch.
 *
 * Blocks:
 *   - Non-http(s) protocols (file:, ftp:, data:, gopher:, etc.)
 *   - Loopback:              localhost, 127.x.x.x, ::1
 *   - Unspecified:           0.0.0.0
 *   - RFC-1918 private:      10.x, 172.16–31.x, 192.168.x
 *   - Link-local/APIPA:      169.254.x  (includes AWS metadata 169.254.169.254)
 *   - Carrier-grade NAT:     100.64.x – 100.127.x
 *   - IPv6 unique-local:     fc00::/7  (fc.. / fd..)
 *   - IPv6 link-local:       fe80::/10
 *   - IPv4-mapped IPv6:      ::ffff:x  (wraps private IPv4 inside IPv6)
 *   - 6to4 IPv6:             2002::/16 (encodes IPv4 in bits 17–48)
 *   - Non-standard IPv4:     hex (0x7f000001), integer (2130706433), octal octets (0177.0.0.1)
 */
export function isUrlSafe(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false; // unparseable → block
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Loopback / localhost
  if (host === 'localhost') return false;
  if (host === '::1')       return false;

  // Unspecified address
  if (host === '0.0.0.0') return false;

  // Non-standard IPv4 representations — belt-and-suspenders before dot-splitting.
  // WHATWG URL normalises these to dotted-decimal in Node 18+, but we block
  // the raw patterns explicitly as well for older/non-standard runtimes.
  //   Single decimal integer:  2130706433  (= 127.0.0.1)
  //   Hex literal:             0x7f000001  (= 127.0.0.1)
  if (/^\d+$/.test(host))          return false; // integer-form IPv4
  if (/^0x[0-9a-f]+$/i.test(host)) return false; // hex-form IPv4

  // Octal-octet check — applies to ANY dotted-notation length (1–4 parts).
  // Covers short forms that bypass the 4-part guard:
  //   0177.1      → 127.0.0.1  (2-part)
  //   0177.0.1    → 127.0.0.1  (3-part)
  //   0177.0.0.1  → 127.0.0.1  (4-part)
  // A leading zero followed by more digits is octal notation.
  const ipParts = host.split('.');
  if (ipParts.length >= 1 && ipParts.length <= 4) {
    if (ipParts.some(p => /^0\d+$/.test(p))) return false;
  }

  // Standard 4-part dotted-decimal range checks
  if (ipParts.length === 4 && ipParts.every(p => /^\d+$/.test(p))) {
    const [a, b] = ipParts.map(Number);
    if (a === 127)                        return false; // 127.0.0.0/8  loopback
    if (a === 10)                         return false; // 10.0.0.0/8   private
    if (a === 192 && b === 168)           return false; // 192.168.0.0/16 private
    if (a === 172 && b >= 16 && b <= 31)  return false; // 172.16.0.0/12 private
    if (a === 169 && b === 254)           return false; // 169.254.0.0/16 link-local
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  }

  // IPv6 checks (host is already lowercased, brackets stripped)
  if (host.includes(':')) {
    if (host === '::1')                                    return false; // loopback
    if (host.startsWith('fc') || host.startsWith('fd'))   return false; // fc00::/7 unique-local
    if (host.startsWith('fe8') || host.startsWith('fe9') ||
        host.startsWith('fea') || host.startsWith('feb')) return false; // fe80::/10 link-local
    // IPv4-mapped IPv6 — ::ffff:x.x.x.x or ::ffff:xxxx:xxxx
    // These wrap IPv4 addresses (including private ranges) inside IPv6 syntax.
    if (host.startsWith('::ffff:'))                        return false;
    // 6to4 — 2002::/16: bits 17–48 encode an IPv4 address directly.
    // Any 6to4 address could route to a private IPv4 endpoint.
    if (host.startsWith('2002:'))                          return false;
  }

  return true;
}

/**
 * Safe fetch with timeout.
 * Returns { ok, status, url, data, text, error }.
 * data = parsed JSON when Content-Type indicates JSON (or text looks like JSON).
 * text = raw response body for HTML/XML responses.
 */
export async function safeFetch(url, { timeoutMs = 12000, method = 'GET', headers = {} } = {}) {
  // SSRF guard — block private/internal targets before any network call
  if (!isUrlSafe(url)) {
    return { ok: false, status: 0, url, data: null, text: null, error: 'Blocked unsafe target URL.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FUFLDCatalogBot/1.0; +https://fulfld.com)',
        ...headers,
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    // SSRF guard — verify the final URL after following any redirects.
    //
    // Three cases:
    //   1. res.url is a non-empty string different from the original → redirect occurred,
    //      check the destination.
    //   2. res.url is a non-empty string equal to the original → no redirect, already
    //      passed the pre-fetch guard above, proceed.
    //   3. res.url is empty/missing → the runtime did not report the final URL.
    //      If a redirect occurred (res.redirected === true) the destination is unknown
    //      and cannot be verified → block.  If no redirect occurred, proceed safely.
    const reportedUrl = (typeof res.url === 'string' && res.url.length > 0) ? res.url : null;
    if (reportedUrl !== null && reportedUrl !== url) {
      // Case 1 — known redirect destination
      if (!isUrlSafe(reportedUrl)) {
        clearTimeout(timer); // prevent timer leak on early return
        return { ok: false, status: 0, url: reportedUrl, data: null, text: null, error: 'Blocked unsafe target URL.' };
      }
    } else if (reportedUrl === null && res.redirected === true) {
      // Case 3 — redirect occurred but destination unknown; block as unverifiable
      clearTimeout(timer); // prevent timer leak on early return
      return { ok: false, status: 0, url, data: null, text: null, error: 'Blocked unsafe target URL.' };
    }
    const finalUrl = reportedUrl ?? url;

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    let text = null;

    if (contentType.includes('application/json') || contentType.includes('text/json')) {
      try {
        data = await res.json();
      } catch {
        text = await res.text();
      }
    } else {
      text = await res.text();
      // Some Shopify stores serve JSON with wrong content-type — try to parse anyway
      if (text && text.trimStart().startsWith('{')) {
        try { data = JSON.parse(text); } catch { /* leave as text */ }
      }
    }

    return { ok: res.ok, status: res.status, url: finalUrl, data, text };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, url, data: null, text: null, error: err.message };
  }
}
