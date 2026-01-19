import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef
} from 'react';

import CONFIG from '../config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    // 🔹 Initial load from storage
    useEffect(() => {
        // Load initial state
        chrome.storage.sync.get(['extension_auth_token', 'user'], (result) => {
            console.log('[AuthContext] Initial load:', result);
            if (result.extension_auth_token) setToken(result.extension_auth_token);
            if (result.user) setUser(result.user);
            setLoading(false);
        });

        return () => {
            mountedRef.current = false;
        };
    }, []);

    // 🔹 Sync changes from background / other tabs
    useEffect(() => {
        const onChange = (changes, area) => {
            console.log('[AuthContext] Storage changed:', area, changes);
            if (area !== 'sync') return;

            if (changes.extension_auth_token) {
                console.log('[AuthContext] Token updated:', changes.extension_auth_token.newValue);
                setToken(changes.extension_auth_token.newValue || null);
            }
            if (changes.user) {
                console.log('[AuthContext] User updated:', changes.user.newValue);
                setUser(changes.user.newValue || null);
            }
        };

        chrome.storage.onChanged.addListener(onChange);
        return () => chrome.storage.onChanged.removeListener(onChange);
    }, []);

    // 🔐 Start OAuth flow
    const login = () => {
        chrome.runtime.sendMessage({ type: 'START_AUTH' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Runtime error:', chrome.runtime.lastError);
                return;
            }

            if (!response?.ok) {
                console.error('❌ OAuth failed:', response?.error);
                return;
            }

            console.log('✅ OAuth flow completed, waiting for token...');
        });
    };



    // 🚪 Logout
    const logout = () => {
        chrome.storage.sync.remove(
            ['extension_auth_token', 'user'],
            () => {
                if (mountedRef.current) {
                    setToken(null);
                    setUser(null);
                }
                // Redirect to home page where user can perform actual logout
                chrome.tabs.create({ url: 'http://localhost:8080/home' });
            }
        );
    };

    return (
        <AuthContext.Provider
            value={{
                token,
                user,
                loading,
                login,
                logout,
                isAuthenticated: Boolean(token)
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
};
