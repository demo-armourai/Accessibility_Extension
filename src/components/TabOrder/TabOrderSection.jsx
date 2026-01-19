import React, { useEffect, useState } from 'react';
import styles from './TabOrder.module.css';
import { useAccessibility } from '../../context/AccessibilityContext';
import TabOrderInfo from './TabOrderInfo';
import TabOrderItem from './TabOrderItem';
import Toast from '../Dashboard/Toast';
import { DiffEngine } from '../../utils/diffEngine';

const TabOrderSection = () => {

    const { tabOrder, history } = useAccessibility();
    const {
        orderData, isScanningTabOrder, tabOrderError, overlayVisible, isDiffOverlayVisible,
        runTabOrderScan, showOverlay, hideOverlay, showDiffOverlay, hideDiffOverlay,
        highlightElement, tabOrderMetadata, setOrderData, setTabOrderMetadata
    } = tabOrder;
    const { saveScan, scanHistory, getRemainingCooldown } = history;
    const [toastMessage, setToastMessage] = useState(null);
    const [cooldown, setCooldown] = useState(0);
    const hasData = Boolean(orderData && orderData.length > 0);

    useEffect(() => {
        if (!orderData && !isScanningTabOrder) {
            runTabOrderScan();
        }
    }, [orderData, isScanningTabOrder, runTabOrderScan]);

    // Clean up overlay when component unmounts
    useEffect(() => {
        return () => {
            if (overlayVisible) hideOverlay();
            if (isDiffOverlayVisible) hideDiffOverlay();
        };
    }, [overlayVisible, isDiffOverlayVisible, hideOverlay, hideDiffOverlay]);

    // Cooldown timer
    useEffect(() => {
        const url = tabOrderMetadata?.url || window.location.href;
        const updateCooldown = () => {
            const remaining = getRemainingCooldown(url);
            setCooldown(remaining);
        };

        updateCooldown();
        const interval = setInterval(updateCooldown, 1000);
        return () => clearInterval(interval);
    }, [getRemainingCooldown, tabOrderMetadata?.url]);

    const handleToggleOverlay = () => {
        if (overlayVisible) {
            hideOverlay();
        } else {
            if (isDiffOverlayVisible) hideDiffOverlay();
            showOverlay();
        }
    };

    const handleSaveScan = async () => {
        if (!orderData) return;
        try {
            const metadata = tabOrderMetadata || {
                title: document.title,
                url: window.location.href
            };
            await saveScan('tab-order', orderData, metadata);
            setToastMessage('Tab Order scan saved to history!');
        } catch (e) {
            console.error(e);
            setToastMessage('Failed to save scan.');
        }
    };

    const handleComparePrevious = async () => {
        if (isDiffOverlayVisible) {
            hideDiffOverlay();
            return;
        }

        if (!orderData) {
            setToastMessage('Please run a current scan first to compare.');
            return;
        }

        try {
            // Use the new smart fetcher
            const currentUrl = tabOrderMetadata?.url || "unknown"; // Use metadata URL which is the page URL
            const oldScanData = await history.getLatestScanForPage('tab-order', currentUrl);

            if (oldScanData) {
                const oldScanWrapper = { type: 'tab-order', data: oldScanData };
                const diff = DiffEngine.compareScans(oldScanWrapper, { type: 'tab-order', data: orderData });
                if (overlayVisible) hideOverlay();
                showDiffOverlay(diff);
                setToastMessage('Diff Overlay loaded: Green (+), Red (-), Orange (Order Change)');
            } else {
                setToastMessage('No previous scan found for this URL.');
            }
        } catch (e) {
            console.error(e);
            setToastMessage('Failed to compare with previous scan.');
        }
    };

    const handleHighlight = (orderNumber) => {
        // Show overlay if not already visible
        if (!overlayVisible) {
            showOverlay();
            // Wait a bit for overlay to render before highlighting
            setTimeout(() => {
                highlightElement(orderNumber);
            }, 500);
        } else {
            highlightElement(orderNumber);
        }
    };

    return (
        <div className={styles.orderSection}>
            {isScanningTabOrder && (
                <div className={styles.statusMessage}>
                    <p>Scanning page for tab order...</p>
                </div>
            )}

            {!isScanningTabOrder && !hasData && !tabOrderError && (
                <div className={styles.emptyState}>
                    <p>Trigger a scan to view tab order.</p>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className={styles.primaryBtn} type="button" onClick={runTabOrderScan}>
                            Scan Page
                        </button>
                        <button
                            className={`${styles.overlayBtn} ${isDiffOverlayVisible ? styles.overlayBtnActive : ''}`}
                            type="button"
                            onClick={handleComparePrevious}
                            style={isDiffOverlayVisible ? {} : {
                                backgroundColor: '#fff',
                                border: '1px solid #ccc',
                                color: '#333'
                            }}
                        >
                            {isDiffOverlayVisible ? 'Hide Compare' : 'Compare with Previous'}
                        </button>
                    </div>
                </div>
            )}

            {hasData && (
                <>
                    <div className={styles.headerSection}>
                        <h2 className={styles.sectionTitle}>Order</h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {/* <button
                                className={styles.overlayBtn}
                                type="button"
                                onClick={handleSaveScan}
                                disabled={cooldown > 0}
                                style={{
                                    backgroundColor: cooldown > 0 ? '#f5f5f5' : '#fff',
                                    border: '1px solid #ccc',
                                    color: cooldown > 0 ? '#999' : '#333',
                                    cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                                    minWidth: '80px'
                                }}
                            >
                                {cooldown > 0 ? `Wait ${cooldown}s` : '💾 Save'}
                            </button>*/}
                            <button
                                className={`${styles.overlayBtn} ${overlayVisible ? styles.overlayBtnActive : ''}`}
                                type="button"
                                onClick={handleToggleOverlay}
                            >
                                {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
                            </button>
                            <button
                                className={`${styles.overlayBtn} ${isDiffOverlayVisible ? styles.overlayBtnActive : ''}`}
                                type="button"
                                onClick={handleComparePrevious}
                            >
                                {isDiffOverlayVisible ? 'Hide Compare' : 'Compare with Previous'}
                            </button>
                        </div>
                    </div>
                    <TabOrderInfo />
                    <div className={styles.orderList}>
                        {orderData.map((item) => (
                            <TabOrderItem
                                key={item.element_key || item.order}
                                order={item.order}
                                role={item.role}
                                name={item.name}
                                tabindex={item.tabindex}
                                xpath={item.xpath}
                                onHighlight={handleHighlight}
                            />
                        ))}
                    </div>
                </>
            )}

            {tabOrderError && <p className={styles.errorMessage}>{tabOrderError}</p>}

            {toastMessage && (
                <Toast
                    message={toastMessage}
                    onClose={() => setToastMessage(null)}
                />
            )}
        </div>
    );
};

export default TabOrderSection;
