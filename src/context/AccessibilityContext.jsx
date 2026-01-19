import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAxeRunner } from '../hooks/useAxeRunner';
import { useTabOrder } from '../hooks/useTabOrder';
import { useStructure } from '../hooks/useStructure';
import { ScanStorage } from '../utils/scanStorage';
import { useAuth } from './AuthContext';

const AccessibilityContext = createContext(null);

/**
 * Unified context provider that combines Axe, Tab Order, and Structure functionality
 * This provides a single source of truth for all accessibility testing features
 */
export const AccessibilityProvider = ({ children }) => {
    // Get data from all hooks
    const axeData = useAxeRunner();
    const tabOrderData = useTabOrder();
    const structureData = useStructure();

    const { user, token } = useAuth(); // Get auth state

    // History State
    const [scanHistory, setScanHistory] = useState([]);
    // Cooldown State: { [url]: lastSaveTimestamp }
    const [cooldowns, setCooldowns] = useState({});

    // Load initial history and cooldowns
    useEffect(() => {
        if (token) {
            ScanStorage.getScans(token).then(setScanHistory).catch(console.error);
        } else {
            setScanHistory([]);
        }

        // Load cooldowns from storage
        chrome.storage.local.get(['save_cooldowns'], (result) => {
            if (result.save_cooldowns) {
                setCooldowns(result.save_cooldowns);
            }
        });
    }, [token]);

    const refreshHistory = useCallback(async () => {
        if (token) {
            const history = await ScanStorage.getScans(token);
            setScanHistory(history);
        }
    }, [token]);

    const saveScan = useCallback(async (type, data, metadata = {}) => {
        const url = metadata.url || (typeof window !== 'undefined' ? window.location.href : '');

        // Cooldown check
        const lastSave = cooldowns[url] || 0;
        const now = Date.now();
        const remaining = Math.max(0, 60 - Math.floor((now - lastSave) / 1000));

        if (remaining > 0) {
            alert(`Please wait ${remaining}s before saving again for this URL.`);
            return;
        }

        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        // Try uploading if authenticated
        if (user && token) {
            try {
                await ScanStorage.uploadScan(type, data, metadata, viewport, token);
                console.log('✅ Scan uploaded to backend');

                // Update cooldown
                const updatedCooldowns = { ...cooldowns, [url]: Date.now() };
                setCooldowns(updatedCooldowns);
                chrome.storage.local.set({ save_cooldowns: updatedCooldowns });

                await refreshHistory();
            } catch (error) {
                console.error('❌ Failed to upload scan:', error);

                // If it's a 429, the server might have rejected it even if frontend didn't know
                if (error.message.includes('Too Many Requests') || error.message.includes('429')) {
                    const updatedCooldowns = { ...cooldowns, [url]: Date.now() };
                    setCooldowns(updatedCooldowns);
                    chrome.storage.local.set({ save_cooldowns: updatedCooldowns });
                }

                alert('Error: Failed to upload scan to server. ' + error.message);
            }
        } else {
            alert('Please log in to save scans to your history.');
        }
    }, [refreshHistory, user, token, cooldowns]);

    const getRemainingCooldown = useCallback((url) => {
        const lastSave = cooldowns[url] || 0;
        const now = Date.now();
        return Math.max(0, 60 - Math.floor((now - lastSave) / 1000));
    }, [cooldowns]);

    const deleteScan = useCallback(async (id, type) => {
        if (token) {
            await ScanStorage.deleteScan(id, type, token);
            await refreshHistory();
        }
    }, [refreshHistory, token]);

    // Function to load a scan into the view
    const loadScanData = useCallback(async (id, type) => {
        return await ScanStorage.getScan(id, type, token);
    }, [token]);

    const getLatestScanForPage = useCallback(async (type, url) => {
        console.log('Fetching latest scan for', type, url);
        // 1. Try Backend if logged in
        if (user && token) {
            try {
                const backendScan = await ScanStorage.getLatestScan(type, url, token);
                if (backendScan) {
                    console.log('Found backend scan:', backendScan);
                    // Normalize data return
                    let data;
                    if (type === 'axe') {
                        // Backend returns row where "audit_results" contains the axe data
                        const auditData = backendScan.audit_results;
                        data = auditData?.rawAxeOutput || auditData;
                    } else {
                        data = typeof backendScan.data === 'string' ? JSON.parse(backendScan.data) : backendScan.data;
                    }
                    return data;
                }
            } catch (e) {
                console.error('Backend fetch failed:', e);
            }
        }

        return null;
    }, [user, token]);

    // Combine all into a single context value
    const contextValue = {
        // Axe runner data (for Details and Contrast sections)
        axe: {
            results: axeData.results,
            isScanning: axeData.isScanning,
            error: axeData.error,
            runScan: axeData.runScan,
            highlightNode: axeData.highlightNode,
            clearHighlights: axeData.clearHighlights,
            highlightTargetsContrast: axeData.highlightTargetsContrast,
            clearHighlightsContrast: axeData.clearHighlightsContrast,
            toggleHighlight: axeData.toggleHighlight
        },
        // Tab order data (for Order section)
        tabOrder: {
            orderData: tabOrderData.orderData,
            isScanningTabOrder: tabOrderData.isScanningTabOrder,
            tabOrderError: tabOrderData.tabOrderError,
            overlayVisible: tabOrderData.overlayVisible,
            isDiffOverlayVisible: tabOrderData.isDiffOverlayVisible,
            runTabOrderScan: tabOrderData.runTabOrderScan,
            showOverlay: tabOrderData.showOverlay,
            hideOverlay: tabOrderData.hideOverlay,
            showDiffOverlay: tabOrderData.showDiffOverlay,
            hideDiffOverlay: tabOrderData.hideDiffOverlay,
            highlightElement: tabOrderData.highlightElement,
            setOrderData: tabOrderData.setOrderData,
            setTabOrderMetadata: tabOrderData.setTabOrderMetadata,
            tabOrderMetadata: tabOrderData.tabOrderMetadata
        },
        // Structure data (for Structure section)
        structure: {
            structure: structureData.structure,
            isLoadingStructure: structureData.isLoadingStructure,
            structureError: structureData.structureError,
            isDiffOverlayVisible: structureData.isDiffOverlayVisible,
            runStructureScan: structureData.runStructureScan,
            showStructureBadges: structureData.showStructureBadges,
            showStructureDiffOverlay: structureData.showStructureDiffOverlay,
            hideDiffOverlay: structureData.hideDiffOverlay,
            scrollToElement: structureData.scrollToElement,
            setStructure: structureData.setStructure,
            setStructureMetadata: structureData.setStructureMetadata,
            structureMetadata: structureData.structureMetadata
        },
        // History data
        history: {
            scanHistory,
            saveScan,
            deleteScan,
            loadScanData,
            refreshHistory,
            getLatestScanForPage,
            getRemainingCooldown
        }
    };

    return (
        <AccessibilityContext.Provider value={contextValue}>
            {children}
        </AccessibilityContext.Provider>
    );
};

/**
 * Hook to access the unified accessibility context
 * @returns {Object} Combined accessibility data and functions
 */
export const useAccessibility = () => {
    const context = useContext(AccessibilityContext);
    if (!context) {
        throw new Error('useAccessibility must be used within an AccessibilityProvider');
    }
    return context;
};

