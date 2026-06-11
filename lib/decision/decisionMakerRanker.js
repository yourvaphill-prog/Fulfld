/**
 * Decision maker ranker for Decision Maker Finder.
 * Strips HTML to plain text, scans for title keywords, computes confidence,
 * and builds caller guidance. Also calls extractPeople() to surface real
 * contact people found on public pages.
 */

import { extractPeople } from './contactExtractor.js';

const TIERS = [
  {
    tier: 1, points: 100,
    label: 'CEO / Founder',
    keywords: ['founder', 'co-founder', 'cofounder', 'owner', 'ceo', 'chief executive officer', 'chief executive'],
  },
  {
    tier: 2, points: 80,
    label: 'President / General Manager',
    keywords: ['president', 'general manager', 'managing director', 'principal', 'co-owner'],
  },
  {
    tier: 3, points: 70,
    label: 'VP of Sales / Sales Director',
    keywords: [
      'vp of sales', 'vp sales', 'vice president of sales', 'vice president sales',
      'sales director', 'director of sales', 'national sales manager',
      'head of sales', 'regional sales manager', 'sales manager',
    ],
  },
  {
    tier: 4, points: 60,
    label: 'Ecommerce / Marketplace Director',
    keywords: [
      'ecommerce director', 'director of ecommerce', 'vp ecommerce', 'vp of ecommerce',
      'marketplace manager', 'marketplace director', 'amazon manager', 'amazon director',
      'head of ecommerce', 'digital commerce', 'online channel manager',
      'digital director', 'director of digital',
    ],
  },
  {
    tier: 5, points: 50,
    label: 'Wholesale / Business Development',
    keywords: [
      'business development', 'biz dev', 'partnerships manager', 'channel manager',
      'channel partner', 'wholesale director', 'wholesale manager', 'trade sales',
      'key account manager', 'national accounts manager', 'national account manager',
      'account executive', 'sales representative',
    ],
  },
  {
    tier: 6, points: 35,
    label: 'Operations / Supply Chain',
    keywords: [
      'operations director', 'director of operations', 'operations manager',
      'supply chain', 'logistics manager', 'procurement manager', 'fulfillment manager',
    ],
  },
  {
    tier: 7, points: 20,
    label: 'Customer Support / Generic Contact',
    keywords: [
      'customer service', 'customer support', 'customer success',
      'info@', 'hello@', 'contact@', 'support@', 'sales@',
    ],
  },
];

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(str) {
  return str.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

function encodeQ(str) {
  return encodeURIComponent(str);
}

/**
 * Classify what type of phone a fallback page-level number represents,
 * based on which page it was found on.
 */
function classifyFallbackPhoneType(phoneSourceUrl, pageMap) {
  if (!phoneSourceUrl) return 'Needs Verification';
  if (pageMap?.contactPageUrl   && phoneSourceUrl.startsWith(pageMap.contactPageUrl))   return 'Contact Page Phone';
  if (pageMap?.wholesalePageUrl && phoneSourceUrl.startsWith(pageMap.wholesalePageUrl)) return 'Sales Phone';
  if (pageMap?.aboutPageUrl     && phoneSourceUrl.startsWith(pageMap.aboutPageUrl))     return 'Company Phone';
  if (pageMap?.homepageUrl      && phoneSourceUrl.startsWith(pageMap.homepageUrl))      return 'Company HQ Phone';
  return 'Needs Verification';
}

export function rankDecisionMakers({ brandName, fetchedPages, emails, phones, socialLinks, pageMap }) {
  const brand = (brandName || '').trim();

  // ── Extract real people from public page HTML ────────────────────────────────
  const rawPeople = extractPeople(fetchedPages, brand);

  // Enrich each person with brand-aware search URLs and a phone fallback
  const anyPagePhone     = phones[0] || null;
  const anyPagePhoneType = anyPagePhone
    ? classifyFallbackPhoneType(anyPagePhone.sourceUrl, pageMap)
    : '';

  const peopleFound = rawPeople.map(p => {
    // If the person has no phone yet, fall back to the best page-level phone
    const phone     = p.phone || anyPagePhone?.value || '';
    const phoneType = p.phoneType || (phone && !p.phone ? anyPagePhoneType : '');
    return {
      ...p,
      phone,
      phoneType,
      linkedinSearchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeQ(p.name + ' ' + brand)}`,
      googleSearchUrl:   `https://www.google.com/search?q=${encodeQ('"' + p.name + '" "' + brand + '"')}`,
    };
  });

  // ── Scan page text for tier keyword matches (fallback target roles) ───────────
  const allText = fetchedPages
    .map(p => stripHtml(p.html || ''))
    .join(' ')
    .toLowerCase();

  const matched = [];
  for (const tierDef of TIERS) {
    let matchedKeyword = null;
    for (const kw of tierDef.keywords) {
      if (allText.includes(kw.toLowerCase())) { matchedKeyword = kw; break; }
    }
    if (matchedKeyword && !matched.find(m => m.tier === tierDef.tier)) {
      matched.push({ title: titleCase(matchedKeyword), tier: tierDef.tier, points: tierDef.points });
    }
  }

  const targets = matched.length > 0 ? matched : [
    { title: 'CEO / Founder',     tier: 1, points: 100 },
    { title: 'VP of Sales',       tier: 3, points: 70  },
    { title: 'Wholesale Manager', tier: 5, points: 50  },
  ];
  targets.sort((a, b) => b.points - a.points);

  const decisionMakerTargets = targets.map(t => ({
    title:             t.title,
    tier:              t.tier,
    points:            t.points,
    nameFound:         null,
    nameConfidence:    'none',
    linkedinSearchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeQ(t.title + ' ' + brand)}`,
    googleSearchUrl:   `https://www.google.com/search?q=${encodeQ('"' + t.title + '" "' + brand + '" site:linkedin.com')}`,
  }));

  // ── Confidence score ─────────────────────────────────────────────────────────
  const hasHomepage   = fetchedPages.some(p => p.type === 'homepage' && p.status >= 200 && p.status < 400);
  const hasContact    = !!pageMap?.contactPageUrl;
  const hasEmail      = emails.length > 0;
  const hasPhone      = phones.length > 0;
  const hasWholesale  = !!pageMap?.wholesalePageUrl;
  const hasAbout      = !!pageMap?.aboutPageUrl;
  const hasLinkedIn   = socialLinks.some(s => s.platform === 'LinkedIn');
  const hasTitleMatch = matched.length > 0;
  const hasPeople     = peopleFound.length > 0;
  const hasHighPerson = peopleFound.some(p => p.confidenceLabel === 'High');

  let confidenceScore = 0;
  if (hasHomepage)   confidenceScore += 10;
  if (hasContact)    confidenceScore += 15;
  if (hasEmail)      confidenceScore += 20;
  if (hasPhone)      confidenceScore += 15;
  if (hasWholesale)  confidenceScore += 10;
  if (hasAbout)      confidenceScore += 10;
  if (hasLinkedIn)   confidenceScore += 10;
  if (hasTitleMatch) confidenceScore += 10;
  if (hasPeople)     confidenceScore += 10;
  if (hasHighPerson) confidenceScore += 10;

  confidenceScore = Math.min(confidenceScore, 100);
  const confidenceLabel     = confidenceScore >= 80 ? 'High' : confidenceScore >= 50 ? 'Medium' : 'Low';
  const recommendedPriority = decisionMakerTargets[0]?.title || 'Unknown';

  // ── Suggested action — person-first, then contact data, then fallback ────────
  const bestPerson  = peopleFound[0] || null;
  const directEmail = emails.find(e =>
    !e.value.startsWith('info@') && !e.value.startsWith('hello@') &&
    !e.value.startsWith('contact@') && !e.value.startsWith('support@')
  );
  const anyEmail = emails[0];
  const anyPhone = phones[0];

  let suggestedAction;
  if (bestPerson && bestPerson.phone) {
    suggestedAction = `Call ${bestPerson.phone} and ask for ${bestPerson.name}, ${bestPerson.title}. If unavailable, ask for the person handling wholesale, Amazon, or ecommerce partnerships.`;
  } else if (bestPerson && !bestPerson.phone) {
    suggestedAction = `Search for ${bestPerson.name}, ${bestPerson.title}, at ${brand} on LinkedIn. If calling the main number, ask for ${bestPerson.name} specifically.`;
  } else if (directEmail) {
    suggestedAction = `Email ${directEmail.value} and reference your wholesale, ecommerce, or Amazon vendor program.`;
  } else if (anyPhone) {
    suggestedAction = `Call ${anyPhone.value} and ask for the person handling wholesale, Amazon, or ecommerce partnerships.`;
  } else if (anyEmail) {
    suggestedAction = `Email ${anyEmail.value} with subject: Wholesale / Ecommerce Inquiry — keep it brief and direct.`;
  } else {
    suggestedAction = `Search LinkedIn for ${brand} + "${recommendedPriority}" and send a personalized connection request.`;
  }

  // ── Call script ──────────────────────────────────────────────────────────────
  let suggestedCallScript;
  if (bestPerson && bestPerson.phone) {
    suggestedCallScript = `Hi, may I speak with ${bestPerson.name}? My name is [Your Name] with [Your Company]. I'm reaching out regarding a wholesale or ecommerce partnership opportunity with ${brand}. I believe ${bestPerson.name} handles ${bestPerson.title.toLowerCase()} — is now a good time, or should I follow up by email?`;
  } else if (anyPhone) {
    suggestedCallScript = `Hi, I'm calling to speak with whoever handles wholesale or ecommerce partnerships at ${brand}. My name is [Your Name] with [Your Company]. We help brands like yours grow marketplace revenue and expand distribution. Is there someone specific I should connect with, or can you point me in the right direction? I can follow up by email if that's easier.`;
  } else {
    suggestedCallScript = `Hi, my name is [Your Name] with [Your Company]. I'm reaching out to connect with the person at ${brand} who manages wholesale accounts or Amazon and ecommerce partnerships. Could you point me to the right contact, or share their email? I appreciate your help.`;
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  const notes = [];
  if (!hasEmail)      notes.push('No public email found — site may use a contact form or JavaScript-rendered content.');
  if (!hasPhone)      notes.push('No public phone number found.');
  if (!hasTitleMatch) notes.push('No decision maker titles detected in page text — site may be JS-rendered or text-sparse.');
  if (!hasContact)    notes.push('No dedicated contact page was discovered.');
  if (hasPeople && peopleFound.every(p => p.confidenceLabel === 'Low')) {
    notes.push('People found have low confidence — verify names before contacting.');
  }

  return {
    peopleFound,
    decisionMakerTargets,
    recommendedPriority,
    confidenceScore,
    confidenceLabel,
    suggestedAction,
    suggestedCallScript,
    notes: notes.join(' '),
  };
}
