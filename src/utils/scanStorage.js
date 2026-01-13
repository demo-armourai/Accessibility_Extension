/**
 * scanStorage.js
 * Utilities for persisting and retrieving accessibility scans using backend API.
 */

import CONFIG from '../config';

export const ScanStorage = {
    /**
     * Upload scan to backend
     * @param {string} type - 'structure', 'tab-order', or 'axe'
     * @param {any} data - The scan data
     * @param {object} metadata - Metadata (title, url)
     * @param {object} viewport - Viewport dimensions
     * @param {string} token - Auth token
     */
    async uploadScan(type, data, metadata = {}, viewport, token) {
        if (!token) throw new Error('No auth token provided');

        let endpoint;
        let payload;

        if (type === 'axe') {
            endpoint = '/scan/axe';

            const results = data;

            const WCAG_TAGS = [
                "wcag2a", "wcag21a", "wcag22a",
                "wcag2aa", "wcag21aa", "wcag22aa",
                "wcag2aaa"
            ];

            // ✅ FIXED WCAG LEVEL EXTRACTION
            const getWCAGLevel = (tags = []) => {
                if (!tags || tags.length === 0) return 'A'; // Default to A for accessibility rules
                if (tags.some(t => t.endsWith('aaa'))) return 'AAA';
                if (tags.some(t => t.endsWith('aa'))) return 'AA';
                if (tags.some(t => t.endsWith('a'))) return 'A';
                return 'A'; // Fallback for rules without explicit WCAG 2.x level tags
            };

            const countUnique = (items = []) =>
                new Set(items.map(item => item.id)).size;

            const createSummaryTable = (items = []) => {
                const seen = new Set();

                return items
                    .filter(item => {
                        if (seen.has(item.id)) return false;
                        seen.add(item.id);
                        return true;
                    })
                    .map(item => ({
                        ruleId: item.id,
                        level: getWCAGLevel(item.tags),
                        impact: item.impact || item.nodes?.[0]?.impact || 'minor',
                        description: item.description || '',
                        helpUrl: item.helpUrl || '',
                        helpText: item.helpUrl
                            ? `For more information, see: ${item.helpUrl}`
                            : 'No additional help documentation available.',
                        nodes: (item.nodes || []).map(node => ({
                            html: node.html || '',
                            target: node.target || [],
                            failureSummary: node.failureSummary || ''
                        }))
                    }));
            };

            const violations = results.violations || [];
            const passes = results.passes || [];
            const incomplete = results.incomplete || [];
            const inapplicable = results.inapplicable || [];

            const summaryCounts = {
                violations: countUnique(violations),
                passes: countUnique(passes),
                incomplete: countUnique(incomplete),
                inapplicable: countUnique(inapplicable)
            };

            const summaryTables = {
                violations: {
                    count: summaryCounts.violations,
                    rows: createSummaryTable(violations)
                },
                passes: {
                    count: summaryCounts.passes,
                    rows: createSummaryTable(passes)
                },
                incomplete: {
                    count: summaryCounts.incomplete,
                    rows: createSummaryTable(incomplete)
                },
                inapplicable: {
                    count: summaryCounts.inapplicable,
                    rows: createSummaryTable(inapplicable)
                }
            };

            const total = summaryCounts.violations + summaryCounts.passes;
            const score = total > 0
                ? Math.round((summaryCounts.passes / total) * 100)
                : 100;

            payload = {
                url:
                    results.url ||
                    metadata.url ||
                    (typeof window !== 'undefined' ? window.location.href : ''),
                score,
                passes: summaryCounts.passes,
                violations: summaryCounts.violations,
                incomplete: summaryCounts.incomplete,
                inapplicable: summaryCounts.inapplicable,
                auditResults: {
                    summaryCounts,
                    summaryTables,
                    url: results.url || metadata.url,
                    level: metadata.level || 'A',
                    testEnvironment: results.testEnvironment || {
                        browser:
                            typeof navigator !== 'undefined'
                                ? navigator.userAgent
                                : 'unknown',
                        os:
                            typeof navigator !== 'undefined'
                                ? navigator.platform
                                : 'unknown',
                        axeVersion: results.testEngine?.version || 'unknown'
                    },
                    rawAxeOutput: results,
                    remediationIncluded: true
                }
            };
        } else {
            endpoint = type === 'structure'
                ? '/scan/structure'
                : '/scan/tab-order';

            let storageData = data;

            if (Array.isArray(data)) {
                storageData = {};
                data.forEach(item => {
                    let key = item.element_key;

                    if (!key) {
                        key = type === 'tab-order'
                            ? `${item.role || ''}|${item.name || ''}|${item.order}`
                            : `${item.tag || ''}|${item.role || ''}|${item.name || ''}|${item.path || ''}`;
                    }

                    storageData[key] = item;
                });
            }

            payload = {
                url:
                    metadata.url ||
                    (typeof window !== 'undefined' ? window.location.href : ''),
                title:
                    metadata.title ||
                    (typeof document !== 'undefined' ? document.title : ''),
                data: storageData,
                viewport:
                    viewport ||
                    (typeof window !== 'undefined'
                        ? { width: window.innerWidth, height: window.innerHeight }
                        : {})
            };
        }

        const url = `${CONFIG.API_BASE_URL}${endpoint}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(`Upload failed: ${errBody.error || response.statusText}`);
        }

        return await response.json();
    },

    async getLatestScan(type, url, token) {
        if (!token) return null;

        const endpoint =
            type === 'structure'
                ? '/scan/latest/structure'
                : type === 'tab-order'
                    ? '/scan/latest/tab-order'
                    : '/scan/latest/axe';

        const apiUrl = `${CONFIG.API_BASE_URL}${endpoint}?url=${encodeURIComponent(url)}`;

        try {
            const response = await fetch(apiUrl, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 404) return null;
            if (!response.ok) throw new Error('Failed to fetch latest scan');

            return await response.json();
        } catch (e) {
            console.error('Error fetching latest scan:', e);
            return null;
        }
    },

    async getScans(token) {
        if (!token) return [];

        try {
            const [structureRes, tabOrderRes, axeRes] = await Promise.all([
                fetch(`${CONFIG.API_BASE_URL}/scan/structure`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/scan/tab-order`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${CONFIG.API_BASE_URL}/compliance-scores`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const structureData = structureRes.ok ? await structureRes.json() : [];
            const tabOrderData = tabOrderRes.ok ? await tabOrderRes.json() : [];
            const axeData = axeRes.ok ? (await axeRes.json()).scores || [] : [];

            const merged = [
                ...structureData.map(s => ({
                    id: s.id,
                    type: 'structure',
                    timestamp: new Date(s.created_at).getTime(),
                    url: s.url,
                    title: s.title
                })),
                ...tabOrderData.map(s => ({
                    id: s.id,
                    type: 'tab-order',
                    timestamp: new Date(s.created_at).getTime(),
                    url: s.url,
                    title: s.title
                })),
                ...axeData.map(s => ({
                    id: s.id,
                    type: 'axe',
                    timestamp: new Date(s.created_at).getTime(),
                    url: s.url,
                    title: s.title || 'Accessibility Scan'
                }))
            ];

            return merged.sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            console.error('Error fetching scan history:', e);
            return [];
        }
    },

    async getScan(id, type, token) {
        if (!token) return null;

        const endpoint =
            type === 'axe'
                ? `/scan/axe/${id}`
                : type === 'structure'
                    ? `/scan/structure/${id}`
                    : `/scan/tab-order/${id}`;

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) return null;

            const scan = await response.json();

            return {
                id: scan.id,
                timestamp: new Date(scan.created_at).getTime(),
                url: scan.url,
                title: scan.title,
                type,
                data:
                    typeof scan.data === 'string'
                        ? JSON.parse(scan.data)
                        : scan.data || scan.audit_results?.rawAxeOutput || scan.audit_results,
                viewport: scan.viewport
            };
        } catch (e) {
            console.error('Error fetching scan detail:', e);
            return null;
        }
    },

    async deleteScan() {
        console.warn('Delete scan not implemented on backend.');
    },

    async clearAll() {
        console.warn('clearAll not applicable for database storage.');
    }
};
