/**
 * diffEngine.js
 * Logic for comparing two accessibility scans.
 */

export const DiffEngine = {
    /**
     * Compare two scans (Old vs New).
     * @param {Object} oldScan - The baseline scan record.
     * @param {Object} newScan - The comparison scan record.
     * @returns {Object} Diff result { added: [], removed: [], changed: [], unchanged: [] }
     */
    compareScans(oldScan, newScan) {
        if (!oldScan || !newScan) {
            return { error: 'Invalid scans provided.' };
        }

        if (oldScan.type !== newScan.type) {
            return { error: 'Cannot compare scans of different types.' };
        }

        const type = oldScan.type;
        const oldData = oldScan.data || [];
        const newData = newScan.data || [];

        if (type === 'tab-order') {
            return this.compareTabOrder(oldData, newData);
        } else if (type === 'structure') {
            return this.compareStructure(oldData, newData);
        }

        return { error: 'Unknown scan type.' };
    },

    /**
     * Compare Tab Order arrays.
     * Matches items based on 'name' + 'role' + 'tabindex' signature, likely position.
     * Tab Order is an ordered list, so index matters.
     */
    compareTabOrder(oldInput, newInput) {
        const added = [];
        const removed = [];
        const changed = [];
        const unchanged = [];

        // Helper: Convert to Map<Key, Array<Items>> (since TabOrder might have duplicates if key is weak)
        // But with element_key it should be unique.
        const toGroupedMap = (input) => {
            const map = new Map();

            // If Object (Keyed Map from backend)
            if (!Array.isArray(input) && typeof input === 'object') {
                Object.entries(input).forEach(([key, value]) => {
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(value);
                });
                return map;
            }

            // If Array
            (input || []).forEach(item => {
                const key = item.element_key || `${item.role}|${item.name}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(item);
            });
            return map;
        };

        const oldMap = toGroupedMap(oldInput);
        const newMap = toGroupedMap(newInput);

        // 1. Detect Removed
        oldMap.forEach((items, key) => {
            if (!newMap.has(key)) {
                items.forEach(item => removed.push(item));
            } else {
                const newItems = newMap.get(key);
                if (items.length > newItems.length) {
                    for (let i = newItems.length; i < items.length; i++) {
                        removed.push(items[i]);
                    }
                }
            }
        });

        // 2. Detect Added
        newMap.forEach((items, key) => {
            if (!oldMap.has(key)) {
                items.forEach(item => added.push(item));
            } else {
                const oldItems = oldMap.get(key);
                if (items.length > oldItems.length) {
                    for (let i = oldItems.length; i < items.length; i++) {
                        added.push(items[i]);
                    }
                }
            }
        });

        // 3. Detect Changed (Position/Index)
        // For 'Changed', we need strict mapping.
        // If storage is Object, we lose "original array order" unless 'order' property is preserved in value.
        // The saved value usually has "order" property inside.

        // This logic is complex for keyed map because "order" is relative.
        // Assuming we rely on the 'order' property INSIDE the item object.

        newMap.forEach((newItems, key) => {
            if (oldMap.has(key)) {
                const oldItems = oldMap.get(key);
                // Compare first match to first match
                // Ideally use ID matching if possible
                newItems.forEach((newItem, index) => {
                    if (oldItems[index]) {
                        const oldItem = oldItems[index];
                        if (oldItem.order !== newItem.order) {
                            changed.push({
                                ...newItem,
                                oldOrder: oldItem.order,
                                newOrder: newItem.order
                            });
                        }
                    }
                });
            }
        });

        const countItems = (input) => Array.isArray(input) ? input.length : Object.keys(input).length;

        return {
            type: 'tab-order',
            added,
            removed,
            changed,
            totalOld: countItems(oldInput),
            totalNew: countItems(newInput)
        };
    },

    /**
     * Compare Structure arrays (Hierarchical/Linearized).
     * Uses Path or Tag+Role+Name as key.
     */
    /**
     * Compare Structure arrays (refactored for Keyed Objects).
     */
    compareStructure(oldInput, newInput) {
        const added = [];
        const removed = [];

        // Helper to normalize input to Map
        const toMap = (input) => {
            if (!Array.isArray(input) && typeof input === 'object') {
                // Already a keyed object
                return new Map(Object.entries(input));
            }
            // Array -> Map
            const map = new Map();
            (input || []).forEach(item => {
                const key = item.element_key || `${item.tag}|${item.role || 'no-role'}|${item.name || 'no-name'}`;
                map.set(key, item);
            });
            return map;
        };

        const oldSet = toMap(oldInput);
        const newSet = toMap(newInput);

        // Removed: In old but not in new
        oldSet.forEach((item, key) => {
            if (!newSet.has(key)) {
                removed.push(item);
            }
        });

        // Added: In new but not in old
        newSet.forEach((item, key) => {
            if (!oldSet.has(key)) {
                added.push(item);
            }
        });

        return {
            type: 'structure',
            added,
            removed,
            totalOld: oldSet.size,
            totalNew: newSet.size
        };
    }
};
