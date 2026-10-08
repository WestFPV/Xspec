const forbiddenNameFragments = [
  // Profanity, sexual terms, and common abusive slurs.
  'asshole', 'bastard', 'bitch', 'blowjob', 'bullshit', 'chink', 'clitoris',
  'cock', 'cunt', 'dick', 'dildo', 'faggot', 'fuck', 'gook', 'hitler', 'jackass',
  'kkk', 'motherfucker', 'nazi', 'nigger', 'nigga', 'penis', 'pedo', 'pedophile',
  'porn', 'pussy', 'rape', 'retard', 'shit', 'slut', 'twat', 'vagina', 'whore',
  'wanker', 'wank', 'boob', 'hentai', 'tranny', 'shemale', 'kike', 'spic',
  'sexy', 'sexual', 'sexting', 'sexcam', 'sexbot', 'sexslave', 'sexworker', 'sexlover', 'sexchat',
  'xxx', 'nsfw', 'nude', 'nudes', 'naked', 'horny', 'erotic', 'orgasm', 'masturbat',
  'jizz', 'semen', 'sperm', 'vulva', 'clit', 'nipple', 'tits', 'titty',
  'vibrator', 'handjob', 'fellatio', 'cunnilingus', 'threesome', 'gangbang', 'bukkake',
  'incest', 'bdsm', 'fetish', 'onlyfans', 'camgirl', 'camwhore', 'pornstar', 'porno',
  'pornhub', 'xvideos', 'xnxx', 'chaturbate', 'brazzers', 'redtube', 'rule34', 'lewd',
  'analsex', 'analplay', 'analplug', 'analbeads', 'analtoy', 'cumshot', 'cumdump', 'cumslut',
  // Names that could be mistaken for Xspec staff or official accounts.
  'administrator', 'xspec', 'aerframe', 'moderator', 'official', 'support',
];

const reservedNameFragments = ['admin', 'staff'];
const usernameShape = /^[a-zA-Z0-9_]{3,20}$/;
const explicitStandalonePatterns = [
  /(?:^|_)s+_*e+_*x+(?:_|$)/,
  /(?:^|_)a+_*n+_*a+_*l+(?:_|$)/,
  /(?:^|_)c+_*u+_*m+(?:_|$)/,
];

function moderationCharacters(username) {
  return username
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[01345789]/g, (digit) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' })[digit]);
}

function normalizedForModeration(username) {
  return moderationCharacters(username).replace(/[^a-z]/g, '');
}

function compactForModeration(username) {
  return normalizedForModeration(username).replace(/(.)\1+/g, '$1');
}

const moderatedFragments = new Set(forbiddenNameFragments.map(compactForModeration));
const reservedFragments = new Set(reservedNameFragments.map(compactForModeration));

export function usernameError(value) {
  if (typeof value !== 'string' || !usernameShape.test(value.trim())) {
    return 'Choose a 3–20 character username using letters, numbers, or underscores.';
  }

  const normalized = normalizedForModeration(value.trim());
  const compact = compactForModeration(value.trim());
  const separated = moderationCharacters(value.trim()).replace(/[^a-z_]/g, '');
  // Cockpit is a common, legitimate FPV term, so do not reject that word alone.
  const moderationTexts = [normalized, compact].map((text) => text.replaceAll('cockpit', ''));
  const hasExplicitStandaloneTerm = explicitStandalonePatterns.some((pattern) => pattern.test(separated));
  const hasExplicitSexRoot = moderationTexts.some((text) => text.replaceAll('essex', '').replaceAll('sussex', '').includes('sex'));
  const hasExplicitAnalRoot = moderationTexts.some((text) => {
    const ordinaryWordPartsRemoved = text
      .replaceAll('analogue', '')
      .replaceAll('analog', '')
      .replaceAll('analys', '')
      .replaceAll('analyt', '')
      .replaceAll('analyz', '');
    return ordinaryWordPartsRemoved.includes('anal');
  });
  if (hasExplicitStandaloneTerm || hasExplicitSexRoot || hasExplicitAnalRoot || [...moderatedFragments, ...reservedFragments].some((fragment) => moderationTexts.some((text) => text.includes(fragment)))) {
    return 'That username is not allowed. Choose a different name without profanity, sexual content, hate speech, or staff impersonation.';
  }

  return '';
}

export function isAllowedUsername(value) {
  return usernameError(value) === '';
}

export function displayUsername(value, fallback = 'PILOT') {
  return isAllowedUsername(value) ? value.trim() : fallback;
}
