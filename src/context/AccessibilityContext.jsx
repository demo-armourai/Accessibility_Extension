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

    // Load initial history
    useEffect(() => {
        // TODO: fetching from DB if logged in
        ScanStorage.getScans().then(setScanHistory).catch(console.error);
    }, []);

    const refreshHistory = useCallback(async () => {
        // TODO: fetch from DB if logged in
        const history = await ScanStorage.getScans();
        setScanHistory(history);
    }, []);

    const saveScan = useCallback(async (type, data, metadata = {}) => {
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        // Always save locally first (ensures we have a copy even if offline/upload fails)
        try {
            await ScanStorage.saveScan(type, data, metadata);
        } catch (localErr) {
            console.error('Failed to save locally:', localErr);
        }

        // Then try uploading if authenticated
        if (user && token) {
            try {
                await ScanStorage.uploadScan(type, data, metadata, viewport, token);
                console.log('✅ Scan uploaded to backend');
            } catch (error) {
                console.error('❌ Failed to upload scan:', error);
                alert('Warning: Scan saved locally but failed to upload to server. ' + error.message);
            }
        }

        await refreshHistory();
    }, [refreshHistory, user, token]);

    const deleteScan = useCallback(async (id) => {
        await ScanStorage.deleteScan(id);
        await refreshHistory();
    }, [refreshHistory]);

    // Function to load a scan into the view (to be passed to specific contexts if needed, 
    // or handled by components directly calling context)
    const loadScanData = useCallback(async (id) => {
        return await ScanStorage.getScan(id);
    }, []);

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
                console.error('Backend fetch failed, falling back to local', e);
            }
        }

        // 2. Fallback to Local History
        const localHistory = await ScanStorage.getScans();
        const match = localHistory
            .filter(s => s.type === type && (s.url === url || s.url.replace(/\/$/, '') === url.replace(/\/$/, '')))
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (match) {
            const fullScan = await ScanStorage.getScan(match.id);
            return fullScan ? fullScan.data : null;
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
            getLatestScanForPage
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

/**
 * Legacy hook for backward compatibility with existing code
 * @deprecated Use useAccessibility().axe instead
 */
export const useRunner = () => {
    const context = useContext(AccessibilityContext);
    if (!context) {
        throw new Error('useRunner must be used within an AccessibilityProvider');
    }
    return context.axe;
};
