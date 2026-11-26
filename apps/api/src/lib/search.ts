export interface SearchDocument {
  code: string;
  name: string;
  aliases?: string[];
  faculty?: string | null;
  category?: string | null;
  department?: string | null;
  level?: string | null;
  credits?: number | null;
  description?: string | null;
  popularity?: number;
  /**
   * Pre-normalised field values. Callers with a large static corpus set these
   * once at load time so ranking does not re-normalise every field on every
   * query. When present they win over the raw value above.
   */
  normCode?: string;
  normName?: string;
  normFaculty?: string | null;
  normDepartment?: string | null;
  normLevel?: string | null;
}

export interface SearchOptions {
  limit?: number;
  faculty?: string | null;
  category?: string | null;
}

interface SearchFilters {
  code?: string;
  name?: string;
  faculty?: string;
  category?: string;
  department?: string;
  level?: string;
  credits?: number;
}

interface ParsedSearch {
  terms: string[];
  excludes: string[];
  phrase: string | null;
  filters: SearchFilters;
}

const MAX_TERMS = 8;
const FILTER_KEYS = new Set(["code", "name", "faculty", "category", "dept", "department", "level", "credits"]);
const GENERIC_WORDS = new Set([
  "universiti",
  "university",
  "malaya",
  "malaysia",
  "um",
  "of",
  "the",
  "dan",
  "and",
  "for",
  "kelab",
  "persatuan",
  "club",
  "society",
  "association",
  "student",
  "students",
  "badan"
]);

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (const character of input) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (current) tokens.push(current);
  return tokens;
}

export function parseSearchQuery(raw: string): ParsedSearch {
  const filters: SearchFilters = {};
  const terms: string[] = [];
  const excludes: string[] = [];
  const tokens = tokenize(raw.trim()).slice(0, 24);

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("-") && token.length > 1) {
      excludes.push(normalizeSearchText(token.slice(1)));
      continue;
    }
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = token.slice(0, separator).toLowerCase();
      const value = normalizeSearchText(token.slice(separator + 1));
      if (FILTER_KEYS.has(key) && value) {
        if (key === "credits") {
          const credits = Number(value);
          if (Number.isFinite(credits)) filters.credits = credits;
        } else if (key === "dept" || key === "department") {
          filters.department = value;
        } else {
          filters[key as "code" | "name" | "faculty" | "category" | "level"] = value;
        }
        continue;
      }
    }
    if (token.includes(" ") && !terms.some((term) => term === `"${normalizeSearchText(token)}"`)) {
      terms.push(`"${normalizeSearchText(token)}"`);
    } else {
      terms.push(normalizeSearchText(token));
    }
  }

  const normalizedTerms = terms.filter(Boolean).slice(0, MAX_TERMS);
  const phrase =
    normalizedTerms.length > 1
      ? normalizeSearchText(normalizedTerms.map((term) => term.replace(/^"|"$/g, "")).join(" "))
      : null;
  return { terms: normalizedTerms, excludes: excludes.filter(Boolean), phrase, filters };
}

function levenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

function maxDistanceFor(term: string): number {
  if (term.length <= 3) return 1;
  return 2;
}

function scoreWord(term: string, word: string): number {
  if (!term || !word) return 0;
  if (term === word) return 100;
  if (word.startsWith(term)) return 78;
  if (term.length >= 3 && word.includes(term)) return 58;
  if (term.length < 3 || GENERIC_WORDS.has(word)) return 0;
  const distance = levenshtein(term, word, maxDistanceFor(term));
  if (distance <= maxDistanceFor(term)) return Math.max(24, 52 - distance * 12);
  return 0;
}

function scorePhrase(term: string, value: string): number {
  const phrase = term.replace(/^"|"$/g, "");
  if (!phrase) return 0;
  if (value === phrase) return 220;
  if (value.startsWith(phrase)) return 180;
  if (value.includes(phrase)) return 145;
  const words = phrase.split(" ").filter(Boolean);
  if (words.length > 1) {
    const allWords = value.split(" ");
    const matched = words.every((word) => allWords.some((candidate) => candidate === word || scoreWord(word, candidate) > 0));
    if (matched) return 120;
  }
  return 0;
}

interface PreparedField {
  normalized: string;
  words: string[];
}

const NO_FIELD = null;

/**
 * Normalises and splits a field once per document instead of once per term.
 * With 4.6k documents and a multi-term query this removes the majority of the
 * allocation and normalisation work.
 */
function prepareField(value: string | null | undefined, preNormalized?: string | null): PreparedField | null {
  const normalized = preNormalized !== undefined ? preNormalized : value ? normalizeSearchText(value) : "";
  if (!normalized) return NO_FIELD;
  return { normalized, words: normalized.split(" ") };
}

function scorePrepared(term: string, field: PreparedField | null, weight: number): number {
  if (!field) return 0;
  if (term.startsWith('"') && term.endsWith('"')) return scorePhrase(term, field.normalized) * weight;
  let best = 0;
  const words = field.words;
  for (let i = 0; i < words.length; i += 1) {
    const score = scoreWord(term, words[i]);
    if (score > best) best = score;
  }
  if (best === 0 && field.normalized.includes(term)) best = 42;
  return best * weight;
}

function matchesFilter(value: string | null | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  return normalizeSearchText(value).includes(filter);
}

function passesFilters(document: SearchDocument, filters: SearchFilters, options: SearchOptions): boolean {
  if (options.faculty && !matchesFilter(document.faculty, normalizeSearchText(options.faculty))) return false;
  if (options.category && !matchesFilter(document.category, normalizeSearchText(options.category))) return false;
  if (filters.code && !matchesFilter(document.code, filters.code)) return false;
  if (filters.name && !matchesFilter(document.name, filters.name)) return false;
  if (filters.faculty && !matchesFilter(document.faculty, filters.faculty)) return false;
  if (filters.category && !matchesFilter(document.category, filters.category)) return false;
  if (filters.department && !matchesFilter(document.department, filters.department)) return false;
  if (filters.level && !matchesFilter(document.level, filters.level)) return false;
  if (filters.credits !== undefined && document.credits !== filters.credits) return false;
  return true;
}

function isExcluded(document: SearchDocument, excludes: string[]): boolean {
  if (excludes.length === 0) return false;
  const haystack = [
    document.code,
    document.name,
    ...(document.aliases ?? []),
    document.faculty,
    document.category,
    document.department,
    document.level
  ]
    .filter(Boolean)
    .map((value) => normalizeSearchText(value))
    .join(" ");
  return excludes.some((exclude) => haystack.includes(exclude));
}

function isExactMatch(document: SearchDocument, parsed: ParsedSearch): boolean {
  if (parsed.terms.length !== 1) return false;
  const term = parsed.terms[0].replace(/^"|"$/g, "");
  if (!term) return false;
  const normalizedValues = [
    document.normCode ?? normalizeSearchText(document.code),
    document.normName ?? normalizeSearchText(document.name),
    ...(document.aliases ?? []).map((alias) => normalizeSearchText(alias)),
    document.category ? normalizeSearchText(document.category) : null,
    document.normFaculty ?? (document.faculty ? normalizeSearchText(document.faculty) : null)
  ];
  return normalizedValues.some((value) => Boolean(value) && value === term);
}

function scoreDocument(document: SearchDocument, parsed: ParsedSearch): number {
  const { terms, phrase } = parsed;
  if (terms.length === 0) return 1;

  const code = prepareField(document.code, document.normCode);
  const name = prepareField(document.name, document.normName);
  const faculty = prepareField(document.faculty, document.normFaculty);
  const category = prepareField(document.category);
  const department = prepareField(document.department, document.normDepartment);
  const level = prepareField(document.level, document.normLevel);
  const description = prepareField(document.description);
  const aliases = (document.aliases ?? []).map((alias) => prepareField(alias)).filter((alias): alias is PreparedField => alias !== null);

  let total = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    const codeScore = scorePrepared(term, code, 4);
    const nameScore = scorePrepared(term, name, 2.4);
    let aliasScore = 0;
    for (const alias of aliases) {
      const score = scorePrepared(term, alias, 2.1);
      if (score > aliasScore) aliasScore = score;
    }
    const facultyScore = scorePrepared(term, faculty, 0.7);
    const categoryScore = scorePrepared(term, category, 0.8);
    const departmentScore = scorePrepared(term, department, 0.6);
    const levelScore = scorePrepared(term, level, 0.5);
    const descriptionScore = scorePrepared(term, description, 0.18);
    const termScore = Math.max(
      codeScore,
      nameScore,
      aliasScore,
      facultyScore,
      categoryScore,
      departmentScore,
      levelScore
    );
    if (termScore > 0) {
      matchedTerms += 1;
      total += termScore + descriptionScore;
    }
  }

  if (phrase) {
    const phraseValue = normalizeSearchText(phrase);
    const codePhrase = code && code.normalized.includes(phraseValue) ? 90 : 0;
    const namePhrase = scorePrepared(`"${phraseValue}"`, name, 1.4);
    let aliasPhrase = 0;
    for (const alias of aliases) {
      const score = scorePrepared(`"${phraseValue}"`, alias, 1.3);
      if (score > aliasPhrase) aliasPhrase = score;
    }
    total += Math.max(codePhrase, namePhrase, aliasPhrase);
  }

  const requiredMatches = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.66);
  const minScore = terms.length === 1 ? 48 : 30;
  if (matchedTerms < requiredMatches) return 0;
  if (total < minScore) return 0;

  const popularity = Math.max(0, Math.min(document.popularity ?? 0, 40));
  return total + popularity * 0.04;
}

export function searchItems<T extends SearchDocument>(
  items: T[],
  query: string,
  options: SearchOptions = {}
): T[] {
  const parsed = parseSearchQuery(query);
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const results: Array<{ item: T; score: number; index: number; exact: boolean }> = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!passesFilters(item, parsed.filters, options)) continue;
    if (isExcluded(item, parsed.excludes)) continue;
    const score = scoreDocument(item, parsed);
    if (score > 0) results.push({ item, score, index, exact: isExactMatch(item, parsed) });
  }

  const filtered = results.some((result) => result.exact)
    ? results.filter((result) => result.exact)
    : results;

  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name, "en", { sensitivity: "base" }) || a.index - b.index;
  });

  return filtered.slice(0, limit).map((result) => result.item);
}
