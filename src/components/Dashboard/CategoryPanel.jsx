import React from 'react';
import styles from './Dashboard.module.css';
import ItemViewer from './ItemViewer';

const CategoryPanel = ({
    title,
    count,
    items,
    isOpen,
    onToggle,
    activeIndex,
    onPrev,
    onNext,
    onHighlight,
    highlightedItemId,
    onHighlightGroup,
    isGroupHighlighted
}) => (
    <div className={styles['category-panel']}>
        <div className={styles['category-header-wrapper']}>
            <button className={styles['category-header']} aria-expanded={isOpen} onClick={onToggle} type="button">
                <span>{title}</span>
                <div className={styles['count-group']}>
                    <span className={styles['count-pill']}>{count}</span>
                    <span className={`${styles.chevron} ${isOpen ? styles.open : ''}`} aria-hidden>
                        ▾
                    </span>
                </div>
            </button>
            <button
                className={`${styles['highlight-group-btn']} ${isGroupHighlighted ? styles.active : ''}`}
                type="button"
                onClick={(e) => { e.stopPropagation(); onHighlightGroup(); }}
                aria-pressed={isGroupHighlighted}
                title={isGroupHighlighted ? 'Remove group highlight' : 'Highlight all in this group'}
            >
                {isGroupHighlighted ? 'Remove' : 'Highlight Group'}
            </button>
        </div>
        {isOpen && (
            <div className={styles['category-body']}>
                {items.length ? (
                    <ItemViewer
                        item={items[activeIndex]}
                        index={activeIndex}
                        total={items.length}
                        onPrev={onPrev}
                        onNext={onNext}
                        onHighlight={() => onHighlight(items[activeIndex])}
                        highlightedItemId={highlightedItemId}
                    />
                ) : (
                    <p className={styles['empty-copy']}>No entries to display.</p>
                )}
            </div>
        )}
    </div>
);

export default CategoryPanel;

