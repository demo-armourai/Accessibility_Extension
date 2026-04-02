import * as XLSX from 'xlsx';
import { getCheckpointLabel, getWcagCriteriaLabel } from './wcagFromTags.js';

const HEADERS = [
    'S.NO',
    'Issue Type',
    'Violation ID',
    'Impact',
    'Description',
    'Help URL',
    'CheckPoint',
    'WCAG Criteria',
    'Target Node(s)',
    'HTML Snippet',
    'Failure Summary'
];

/**
 * Strict violations only (exclude axe "best-practice" rules).
 * @param {{ violations?: Array<{ id?: string, tags?: string[], nodes?: unknown[] }> } | null | undefined} results
 */
export function getStrictViolations(results) {
    return (results?.violations || []).filter((v) => !(v.tags || []).includes('best-practice'));
}

/**
 * Serialize axe target selectors (iframe chain + selector).
 * @param {string[]|undefined} target
 */
export function formatTargetNodes(target) {
    if (!Array.isArray(target) || target.length === 0) return '';
    return target.join('\n');
}

/**
 * @param {{ violations?: unknown[] } | null | undefined} results
 * @returns {Array<Record<string, string|number>>}
 */
export function flattenViolationsToRows(results) {
    const rows = [];
    let serial = 1;
    for (const violation of getStrictViolations(results)) {
        const tags = violation.tags || [];
        const nodes = violation.nodes || [];
        for (const node of nodes) {
            rows.push({
                sno: serial++,
                issueType: 'Automation',
                violationId: violation.id || '',
                impact: violation.impact || '',
                description: violation.description || '',
                helpUrl: violation.helpUrl || '',
                checkpoint: getCheckpointLabel(tags),
                wcagCriteria: getWcagCriteriaLabel(tags),
                targetNodes: formatTargetNodes(node.target),
                htmlSnippet: node.html || '',
                failureSummary: node.failureSummary || ''
            });
        }
    }
    return rows;
}

/**
 * @param {{ violations?: unknown[] } | null | undefined} results
 * @returns {any[][]} AoA including header row
 */
export function buildSheetAoA(results) {
    const dataRows = flattenViolationsToRows(results).map((r) => [
        r.sno,
        r.issueType,
        r.violationId,
        r.impact,
        r.description,
        r.helpUrl,
        r.checkpoint,
        r.wcagCriteria,
        r.targetNodes,
        r.htmlSnippet,
        r.failureSummary
    ]);
    return [HEADERS, ...dataRows];
}

/**
 * @param {{ violations?: unknown[] } | null | undefined} results
 * @param {string} [filename]
 */
export function downloadAxeReportExcel(results, filename) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        console.warn('Excel download is not supported in this environment.');
        return;
    }

    const aoa = buildSheetAoA(results);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Violations');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const name =
        filename ||
        `accessibility-report-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
