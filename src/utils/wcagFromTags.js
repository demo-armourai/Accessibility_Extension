import { WCAG_SC_TITLES } from './wcagCheckpointMap.js';

const LEVEL_ORDER = [
    ['wcag2aaa', 'AAA'],
    ['wcag2aa', 'AA'],
    ['wcag2a', 'A']
];

/**
 * @param {string[]} tags
 * @returns {'A'|'AA'|'AAA'}
 */
export function getConformanceLevelLetter(tags) {
    const t = new Set(tags || []);
    if (t.has('wcag2aaa')) return 'AAA';
    if (t.has('wcag2aa')) return 'AA';
    if (t.has('wcag2a')) return 'A';
    return 'A';
}

/**
 * axe tags like wcag412 -> "4.1.2"
 * @param {string} tag e.g. "wcag412"
 */
export function wcagNumericTagToScString(tag) {
    const m = /^wcag(\d+)$/.exec(tag);
    if (!m) return null;
    const digits = m[1];
    if (digits.length === 3) {
        return digits.split('').join('.');
    }
    if (digits.length >= 4) {
        return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
    }
    return null;
}

/**
 * Primary WCAG success-criterion tag from axe rule tags.
 * @param {string[]} tags
 * @returns {string|null}
 */
export function getPrimaryWcagScTag(tags) {
    const candidates = (tags || []).filter((tag) => /^wcag\d+$/.test(tag));
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
}

/**
 * @param {string[]} tags
 * @returns {string} e.g. "4.1.2 (A)"
 */
export function getWcagCriteriaLabel(tags) {
    const scTag = getPrimaryWcagScTag(tags);
    const sc = scTag ? wcagNumericTagToScString(scTag) : null;
    const level = getConformanceLevelLetter(tags);
    if (!sc) {
        const fallback = (tags || []).filter((t) => t.startsWith('wcag')).join(', ');
        return fallback || '';
    }
    return `${sc} (${level})`;
}

/**
 * Deque-style checkpoint column.
 * @param {string[]} tags
 * @returns {string}
 */
export function getCheckpointLabel(tags) {
    const scTag = getPrimaryWcagScTag(tags);
    const sc = scTag ? wcagNumericTagToScString(scTag) : null;
    const level = getConformanceLevelLetter(tags);
    if (!sc) {
        return getWcagCriteriaLabel(tags);
    }
    const title = WCAG_SC_TITLES[sc];
    if (title) {
        return `${sc} ${title} (${level})`;
    }
    return `${sc} (${level})`;
}
