import React, { useState, Children, isValidElement, cloneElement } from 'react';
import Tabs from './Tabs';
import { useAccessibility } from '../../context/AccessibilityContext';
import { useAuth } from '../../context/AuthContext';
import { MdLogout, MdRefresh, MdSave } from 'react-icons/md';
import styles from './Layout.module.css';

const Layout = ({ children }) => {
    const [activeTab, setActiveTab] = useState('details');
    const { logout } = useAuth();
    const { runAllScans, saveAllScans } = useAccessibility();

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        className={styles.overlayBtn}
                        onClick={runAllScans}
                        title="Re-run All Scans"
                    >
                        <MdRefresh />
                        Re-run
                    </button>
                    <button
                        className={styles.overlayBtn}
                        onClick={saveAllScans}
                        title="Save All Scans"
                    >
                        <MdSave />
                        Save
                    </button>
                    <button className={styles.logoutBtn} onClick={logout} title="Logout">
                        <MdLogout />
                        Logout
                    </button>
                </div>
            </header>
            <main className={styles.content}>
                {Children.map(children, child => {
                    if (isValidElement(child)) {
                        return cloneElement(child, {
                            activeTab,
                            onTabChange: setActiveTab // Pass the setter
                        });
                    }
                    return child;
                })}
            </main>
        </div>
    );
};

export default Layout;
