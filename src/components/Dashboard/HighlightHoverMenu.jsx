import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dashboard.module.css';

const IMPACT_COLORS = {
    critical: { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
    serious:  { bg: '#ffe4c7', text: '#c2410c', dot: '#f97316' },
    moderate: { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
    minor:    { bg: '#dcfce7', text: '#166534', dot: '#22c55e' }
};

const GroupMenuContent = ({ title, count, impact, wcagTags }) => {
    const key = (impact || '').toLowerCase();
    const colors = IMPACT_COLORS[key] || IMPACT_COLORS.moderate;
    const tags = (wcagTags || []).filter(t => !t.includes('best-practice')).slice(0, 4);

    return (
        <>
            <p className={styles['hmenu-label']}>Violation Rule</p>
            <p className={styles['hmenu-title']}>{title}</p>
            <div className={styles['hmenu-divider']} />
            <div className={styles['hmenu-row']}>
                <span className={styles['hmenu-key']}>Impact</span>
                <span
                    className={styles['hmenu-impact']}
                    style={{ background: colors.bg, color: colors.text }}
                >
                    {impact || 'unknown'}
                </span>
            </div>
            <div className={styles['hmenu-row']}>
                <span className={styles['hmenu-key']}>Affected</span>
                <span className={styles['hmenu-value']}>{count} element{count !== 1 ? 's' : ''}</span>
            </div>
            {tags.length > 0 && (
                <div className={styles['hmenu-tags']}>
                    {tags.map(tag => (
                        <span key={tag} className={styles['hmenu-tag']}>{tag}</span>
                    ))}
                </div>
            )}
        </>
    );
};

const AllMenuContent = ({ summary }) => {
    const rows = [
        { label: 'Critical', count: summary?.critical || 0, dot: IMPACT_COLORS.critical.dot },
        { label: 'Serious',  count: summary?.serious  || 0, dot: IMPACT_COLORS.serious.dot  },
        { label: 'Moderate', count: summary?.moderate || 0, dot: IMPACT_COLORS.moderate.dot },
        { label: 'Minor',    count: summary?.minor    || 0, dot: IMPACT_COLORS.minor.dot    },
    ];
    const total = rows.reduce((sum, r) => sum + r.count, 0);

    return (
        <>
            <p className={styles['hmenu-label']}>Violations Overview</p>
            {rows.map(({ label, count, dot }) => (
                <div key={label} className={styles['hmenu-row']}>
                    <span className={styles['hmenu-severity-row']}>
                        <span className={styles['hmenu-dot']} style={{ background: dot }} />
                        {label}
                    </span>
                    <span className={styles['hmenu-value']}>{count}</span>
                </div>
            ))}
            <div className={styles['hmenu-divider']} />
            <div className={styles['hmenu-row']}>
                <span className={styles['hmenu-key']}>Total violations</span>
                <span className={styles['hmenu-total']}>{total}</span>
            </div>
        </>
    );
};

/**
 * Wraps a button with a hover info card that floats above it.
 * Uses createPortal so the popup renders at document.body level,
 * escaping any ancestor overflow:hidden or CSS transform that would
 * break position:fixed positioning.
 *
 * variant="all"   → shows severity breakdown (pass summary prop)
 * variant="group" → shows rule details (pass title, count, impact, wcagTags)
 */
const HighlightHoverMenu = ({ children, variant, title, count, impact, wcagTags, summary }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const wrapperRef = useRef(null);

    const show = useCallback(() => {
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            // Position popup above the button, centered horizontally
            setPos({
                top: rect.top - 10,   // will be shifted up by translateY(-100%)
                left: rect.left + rect.width / 2
            });
            setVisible(true);
        }
    }, []);

    const hide = useCallback(() => setVisible(false), []);

    const popup = (
        <div
            className={styles['hmenu-popup']}
            style={{ top: pos.top, left: pos.left }}
        >
            {variant === 'all'
                ? <AllMenuContent summary={summary} />
                : <GroupMenuContent title={title} count={count} impact={impact} wcagTags={wcagTags} />
            }
            <div className={styles['hmenu-arrow']} />
        </div>
    );

    return (
        <div
            ref={wrapperRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            style={{ display: 'inline-flex' }}
        >
            {children}
            {visible && createPortal(popup, document.body)}
        </div>
    );
};

export default HighlightHoverMenu;
