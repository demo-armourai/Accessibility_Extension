/**
 * scanStorage.js
 * Utilities for persisting and retrieving accessibility scans using chrome.storage.local.
 */

import CONFIG from '../config';

const STORAGE_KEY_PREFIX = 'axe_scan_';
const MANIFEST_KEY = 'axe_scans_manifest';

/**
 * Generates a UUID for scan identification.
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Storage wrapper to handle chrome.storage.local promises
 */
const storage = {
    get: (keys) => new Promise((resolve, reject) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(keys, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(result);
                    }
                });
            } else {
                // Fallback for non-extension environment (e.g. dev/test)
                const result = {};
                const keyList = Array.isArray(keys) ? keys : [keys];
                keyList.forEach(k => {
                    const val = localStorage.getItem(k);
                    if (val) result[k] = JSON.parse(val);
                });
                resolve(result);
            }
        } catch (e) {
            reject(e);
        }
    }),
    set: (items) => new Promise((resolve, reject) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set(items, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            } else {
                // Fallback
                Object.keys(items).forEach(k => {
                    localStorage.setItem(k, JSON.stringify(items[k]));
                });
                resolve();
            }
        } catch (e) {
            reject(e);
        }
    }),
    remove: (keys) => new Promise((resolve, reject) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(keys, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            } else {
                // Fallback
                const keyList = Array.isArray(keys) ? keys : [keys];
                keyList.forEach(k => localStorage.removeItem(k));
                resolve();
            }
        } catch (e) {
            reject(e);
        }
    })
};

export const ScanStorage = {
    /**
     * Save a new scan.
     * @param {string} type - 'tab-order' | 'structure'
     * @param {Array|Object} data - The scan data
     * @param {Object} metadata - Optional metadata (title, url)
     * @returns {Promise<string>} The new Scan ID
     */
    async saveScan(type, data, metadata = {}) {
        console.log('Saving scan', data);
        const id = generateUUID();
        const timestamp = Date.now();
        const url = metadata.url || (typeof window !== 'undefined' ? window.location.href : '');
        const title = metadata.title || (typeof document !== 'undefined' ? document.title : 'Untitled Page');

        const scanRecord = {
            id,
            timestamp,
            url,
            title,
            type,
            data,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };

        // Save the actual data record
        await storage.set({ [`${STORAGE_KEY_PREFIX}${id}`]: scanRecord });

        // Update the manifest (list of scans)
        const manifest = await this.getScans();
        manifest.unshift({
            id,
            timestamp,
            url,
            title,
            type
        }); // Add to beginning
        await storage.set({ [MANIFEST_KEY]: manifest });

        return id;
    },

    /**
     * Upload scan to backend
     * @param {string} type - 'structure' or 'tab-order'
     * @param {any} data - The scan data
     * @param {object} metadata - Metadata (title, url)
     * @param {object} viewport - Viewport dimensions
     * @param {string} token - Auth token
     */
    async uploadScan(type, data, metadata, viewport, token) {
        if (!token) throw new Error('No auth token provided');

        let endpoint;
        let payload;

        if (type === 'axe') {
            endpoint = '/scan/axe';

            // Format Axe results to match backend compliance_scores expectations
            const results = data; // The raw axe results

            const filterLevelA = (items) => {
                const WCAG_TAGS = ["wcag2a", "wcag21a", "wcag22a"];
                return (items || []).filter(item => item.tags && WCAG_TAGS.some(tag => item.tags.includes(tag)));
            };

            const countUnique = (items) => new Set((items || []).map(item => item.id)).size;

            const createSummaryTable = (items) => {
                const seen = new Set();
                return (items || []).filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                }).map(item => ({
                    ruleId: item.id,
                    level: 'A',
                    impact: item.impact || (item.nodes && item.nodes[0]?.impact) || 'minor',
                    description: item.description || '',
                    helpUrl: item.helpUrl || '',
                    helpText: item.helpUrl ? `For more information, see: ${item.helpUrl}` : 'No additional help documentation available.',
                    nodes: (item.nodes || []).map(node => ({
                        html: node.html || '',
                        target: node.target || [],
                        failureSummary: node.failureSummary || ''
                    }))
                }));
            };

            const violations = filterLevelA(results.violations);
            const passes = filterLevelA(results.passes);
            const incomplete = filterLevelA(results.incomplete);
            const inapplicable = filterLevelA(results.inapplicable);

            const summaryCounts = {
                violations: countUnique(violations),
                passes: countUnique(passes),
                incomplete: countUnique(incomplete),
                inapplicable: countUnique(inapplicable)
            };

            const summaryTables = {
                violations: { count: summaryCounts.violations, rows: createSummaryTable(violations) },
                passes: { count: summaryCounts.passes, rows: createSummaryTable(passes) },
                incomplete: { count: summaryCounts.incomplete, rows: createSummaryTable(incomplete) },
                inapplicable: { count: summaryCounts.inapplicable, rows: createSummaryTable(inapplicable) }
            };

            const total = summaryCounts.violations + summaryCounts.passes;
            const score = total > 0 ? Math.round((summaryCounts.passes / total) * 100) : 100;

            payload = {
                url: results.url || metadata.url || (typeof window !== 'undefined' ? window.location.href : ''),
                score: score,
                passes: summaryCounts.passes,
                violations: summaryCounts.violations,
                incomplete: summaryCounts.incomplete,
                inapplicable: summaryCounts.inapplicable,
                auditResults: {
                    summaryCounts,
                    summaryTables,
                    url: results.url || metadata.url,
                    level: 'A',
                    testEnvironment: results.testEnvironment || {
                        browser: navigator.userAgent,
                        os: navigator.platform,
                        axeVersion: results.testEngine?.version || 'unknown'
                    },
                    rawAxeOutput: results,
                    remediationIncluded: true
                }
            };
        } else {
            endpoint = type === 'structure' ? '/scan/structure' : '/scan/tab-order';

            // Transform Array to Keyed Object (Hash Map) for storage
            let storageData = data;
            if (Array.isArray(data)) {
                storageData = {};
                data.forEach(item => {
                    let key = item.element_key;
                    if (!key) {
                        if (type === 'tab-order') {
                            key = `${item.role || ''}|${item.name || ''}|${item.order}`;
                        } else {
                            key = `${item.tag || ''}|${item.role || ''}|${item.name || ''}|${item.path || ''}`;
                        }
                    }
                    storageData[key] = item;
                });
            }

            payload = {
                url: metadata.url || (typeof window !== 'undefined' ? window.location.href : ''),
                title: metadata.title || (typeof document !== 'undefined' ? document.title : ''),
                data: storageData,
                viewport: viewport || { width: window.innerWidth, height: window.innerHeight }
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

    /**
     * Get latest scan for a URL from backend
     * @param {string} type - 'structure' or 'tab-order'
     * @param {string} url - The URL to check
     * @param {string} token - Auth token
     * @returns {Promise<Object|null>} Latest scan data or null
     */
    async getLatestScan(type, url, token) {
        if (!token) return null;

        const endpoint = type === 'structure' ? '/scan/latest/structure' : '/scan/latest/tab-order';
        const apiUrl = `${CONFIG.API_BASE_URL}${endpoint}?url=${encodeURIComponent(url)}`;

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 404) return null;
            if (!response.ok) throw new Error('Failed to fetch latest scan');

            return await response.json();
        } catch (e) {
            console.error('Error fetching latest scan:', e);
            return null;
        }
    },

    /**
     * Get list of all saved scans (metadata only).
     * @returns {Promise<Array>} List of scan summaries
     */
    async getScans() {
        const result = await storage.get(MANIFEST_KEY);
        return result[MANIFEST_KEY] || [];
    },

    /**
     * Get full data for a specific scan.
     * @param {string} id 
     * @returns {Promise<Object>} Full scan record
     */
    async getScan(id) {
        const key = `${STORAGE_KEY_PREFIX}${id}`;
        const result = await storage.get(key);
        return result[key] || null;
    },

    /**
     * Delete a scan.
     * @param {string} id 
     */
    async deleteScan(id) {
        // Remove data
        await storage.remove(`${STORAGE_KEY_PREFIX}${id}`);

        // Update manifest
        const manifest = await this.getScans();
        const newManifest = manifest.filter(s => s.id !== id);
        await storage.set({ [MANIFEST_KEY]: newManifest });
    },

    /**
     * Clear all scans
     */
    async clearAll() {
        const manifest = await this.getScans();
        const keys = manifest.map(s => `${STORAGE_KEY_PREFIX}${s.id}`);
        keys.push(MANIFEST_KEY);
        await storage.remove(keys);
    }
};
