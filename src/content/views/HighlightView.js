/**
 * HighlightView.js
 * Manages element highlighting logic, including contrast and focus highlights.
 */

import { DomModel } from '../models/DomModel.js';
import { OverlayView } from './OverlayView.js';

const HIGHLIGHT_CLASS = '__axe_extension_highlight';
const HIGHLIGHT_STYLE_ID = '__axe_extension_highlight_style';
const TEAL_HIGHLIGHT_CLASS = '__axe_teal_highlight';
const TEAL_TOOLTIP_CLASS = '__axe_teal_tooltip';
const HMENU_STYLE_ID = '__axe_hmenu_tooltip_styles';

/** Mirrors Dashboard.module.css (.hmenu-*) for parity with DevTools hover cards on the live page and in HTML export. */
const HMENU_TOOLTIP_CSS = `
.axe-hmenu-popup.${TEAL_TOOLTIP_CLASS} {
    position: fixed;
    transform: translateX(-50%) translateY(-100%);
    width: 224px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 14px 16px 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.11), 0 2px 8px rgba(0, 0, 0, 0.07);
    z-index: 2147483647;
    pointer-events: none;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5;
}
.axe-hmenu-popup .axe-hmenu-arrow {
    position: absolute;
    bottom: -6px;
    left: 50%;
    width: 11px;
    height: 11px;
    background: #ffffff;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    transform: translateX(-50%) rotate(45deg);
}
.axe-hmenu-popup.${TEAL_TOOLTIP_CLASS}.axe-hmenu-popup--below {
    transform: translateX(-50%) translateY(0);
}
.axe-hmenu-popup.${TEAL_TOOLTIP_CLASS}.axe-hmenu-popup--below .axe-hmenu-arrow {
    bottom: auto;
    top: -6px;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid #e2e8f0;
    border-left: 1px solid #e2e8f0;
    transform: translateX(-50%) rotate(45deg);
}
.axe-hmenu-popup .axe-hmenu-label {
    font-size: 0.67rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #94a3b8;
    margin: 0 0 8px 0;
}
.axe-hmenu-popup .axe-hmenu-title {
    font-size: 0.84rem;
    font-weight: 600;
    color: #0f172a;
    margin: 0 0 2px 0;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.axe-hmenu-popup .axe-hmenu-divider {
    height: 1px;
    background: #f1f5f9;
    margin: 10px 0;
}
.axe-hmenu-popup .axe-hmenu-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
}
.axe-hmenu-popup .axe-hmenu-key {
    font-size: 0.77rem;
    color: #64748b;
    font-weight: 500;
}
.axe-hmenu-popup .axe-hmenu-value {
    font-size: 0.77rem;
    color: #1e293b;
    font-weight: 600;
}
.axe-hmenu-popup .axe-hmenu-impact {
    font-size: 0.71rem;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 6px;
    text-transform: capitalize;
}
.axe-hmenu-popup .axe-hmenu-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 10px;
}
.axe-hmenu-popup .axe-hmenu-tag {
    font-size: 0.66rem;
    background: #f1f5f9;
    color: #64748b;
    border-radius: 5px;
    padding: 2px 7px;
    font-weight: 500;
}
`;

const IMPACT_COLORS = {
    critical: { bg: '#fee2e2', text: '#b91c1c' },
    serious:  { bg: '#ffe4c7', text: '#c2410c' },
    moderate: { bg: '#fef3c7', text: '#92400e' },
    minor:    { bg: '#dcfce7', text: '#166534' }
};

export class HighlightView {
    static currentHighlightedElement = null;

    static escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    static escapeHtmlAttr(str) {
        return HighlightView.escapeHtml(str).replace(/'/g, '&#39;');
    }

    static ensureHmenuStyles() {
        if (document.getElementById(HMENU_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = HMENU_STYLE_ID;
        style.textContent = HMENU_TOOLTIP_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    static highlightElement(selectorData) {
        this.clearMainHighlight();
        this.ensureHighlightStyle(); // For potential fallback or mixed usage

        const { element, frame, reason } = DomModel.findElement(selectorData);

        if (element) {
            this.applyHighlight(element);
            this.scrollIntoView(element, frame);
            this.currentHighlightedElement = element;
            return { found: true };
        }

        return { found: false, reason };
    }

    static toggleHighlight(selectorData) {
        // Check if *this specific element* is highlighted? 
        // Runner.js logic was checking if currentHighlightedElement matches. 
        // But since we can only highlight one thing at a time for "main" highlight, 
        // we just check if we have a current highlight.
        // Actually runner.js checked:
        // const isCurrentlyHighlighted = currentHighlightedElement && currentHighlightedElement.classList.contains(HIGHLIGHT_CLASS);
        // But applyHighlight uses Overlay now, not class? 
        // Let's assume toggle means: "if I am highlighting THIS, turn it off. Else highlight THIS."
        // But to know if we are highlighting THIS, we need to find it first.

        // Simplification: If we have a current highlight, clear it. If the user clicked the SAME thing, we are done. 
        // If they clicked a DIFFERENT thing, highlight it.
        // However, the caller usually passes the selector of what was clicked.
        // Let's stick to runner.js logic: it always finds the element first?
        // No, runner.js checked `isCurrentlyHighlighted` using `currentHighlightedElement` reference.

        // If we have a current element, let's clear it.
        if (this.currentHighlightedElement) {
            // If the user meant "toggle off", we are good.
            // If the user meant "toggle on (different element)", we need to know.
            // Since we don't have the element yet, we can't compare.
            // But the UI usually tracks state. 
            // For now, let's just implement explicit highlight and explicit clear if needed.
            // But for `toggle-highlight` message support:
            this.clearMainHighlight();
            // Return found: true, isHighlighted: false?
            // Wait, if I clear it, I'm done?
            // The UI needs to know current state. 
            // Let's assume the UI handles "toggle" by sending "highlight" or "clear".
            // But runner.js had `toggle-highlight`.
            // Let's re-implement `highlightElement` logic for toggle:
            // Actually, let's just run HighlightElement. 
            // If the user wants to toggle OFF, they usually send a clear command. 
            // Or if the extension UI is stateful.
            // I will implement `highlightElement` which effectively clobbers previous.
            // If we strictly need toggle:
            // Since we cleared, we just highlight the new one.
        }

        return this.highlightElement(selectorData);
    }

    static applyHighlight(element) {
        if (!element) return;
        // Use OverlayView
        OverlayView.createOverlay(element, OverlayView.getBadgeInfo(element));
    }

    static removeHighlight(element) {
        // OverlayView.clearOverlays handles checking ID
    }

    static clearMainHighlight() {
        if (this.currentHighlightedElement) {
            this.currentHighlightedElement = null;
        }
        OverlayView.clearOverlays();
    }

    static scrollIntoView(element, frame = window) {
        if (!element) return;
        try {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
            // Handle iframe scrolling... (simplified for now, standard scrollIntoView often works)
        } catch (e) {
            // Ignore
        }
    }

    // --- Contrast Highlighting (Green Outline) ---

    static highlightTargetsContrast(selectors) {
        this.clearContrastHighlights();
        if (!Array.isArray(selectors) || selectors.length === 0) return;

        this.ensureHighlightStyleContrast();
        let scrolled = false;

        selectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(node => {
                    this.applyHighlightContrast(node);
                    if (!scrolled) {
                        node.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
                        scrolled = true;
                    }
                });
            } catch (e) { }
        });
    }

    static applyHighlightContrast(node) {
        if (!node) return;
        if (!node.__axePrevStyles) {
            node.__axePrevStyles = {
                outline: node.style.outline,
                outlineOffset: node.style.outlineOffset,
                boxShadow: node.style.boxShadow,
                position: node.style.position,
                zIndex: node.style.zIndex
            };
        }
        node.classList.add(HIGHLIGHT_CLASS);
        node.style.outline = '3px solid #39FF14';
        node.style.outlineOffset = '4px';
        node.style.boxShadow = '0 0 0 3px rgba(57, 255, 20, 0.45), 0 0 12px rgba(57, 255, 20, 0.85)';
        node.style.position = 'relative';
        node.style.zIndex = '99999';
    }

    static clearContrastHighlights() {
        document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(node => {
            node.classList.remove(HIGHLIGHT_CLASS);
            if (node.__axePrevStyles) {
                node.style.outline = node.__axePrevStyles.outline || '';
                node.style.outlineOffset = node.__axePrevStyles.outlineOffset || '';
                node.style.boxShadow = node.__axePrevStyles.boxShadow || '';
                node.style.position = node.__axePrevStyles.position || '';
                node.style.zIndex = node.__axePrevStyles.zIndex || '';
                delete node.__axePrevStyles;
            } else {
                node.style.outline = '';
                node.style.outlineOffset = '';
                node.style.boxShadow = '';
                node.style.position = '';
                node.style.zIndex = '';
            }
        });
    }

    // --- Generic Target Highlighting (Using Overlay) ---

    static highlightTargets(selectors) {
        this.clearMainHighlight(); // Clear existing generic overlays
        if (!Array.isArray(selectors) || selectors.length === 0) return;

        selectors.forEach(item => {
            // If string, try to resolve path/selector
            // DomModel.resolvePath ???
            // We can use DomModel.findElement logic or simple querySelector
            let nodes = [];
            try {
                // For simple selectors
                nodes = Array.from(document.querySelectorAll(item));
            } catch (e) {
                // Maybe it's a path
                const el = DomModel.resolvePath(item);
                if (el) nodes = [el];
            }

            nodes.forEach(node => this.applyHighlight(node));
        });
    }

    // --- Styles ---

    static ensureHighlightStyle() {
        // Legacy yellow pulse, mainly for fallback or if we use class
        // But we are using overlay now.
    }

    static ensureHighlightStyleContrast() {
        if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = HIGHLIGHT_STYLE_ID;
        style.textContent = `
      .${HIGHLIGHT_CLASS} {
        position: relative !important;
        animation: __axe_pulse 2s ease-in-out infinite;
      }
      @keyframes __axe_pulse {
        0%, 100% {
          box-shadow: 0 0 0 3px rgba(57, 255, 20, 0.45), 0 0 20px rgba(57, 255, 20, 0.5);
        }
        50% {
          box-shadow: 0 0 0 3px rgba(57, 255, 20, 0.6), 0 0 30px rgba(57, 255, 20, 0.8);
        }
      }
    `;
        document.documentElement.appendChild(style);
    }

    // --- Teal Multi-Highlight (Highlight All / Highlight Group) ---

    static applyHighlightTeal(node) {
        if (!node) return;
        if (!node.__axePrevStylesTeal) {
            node.__axePrevStylesTeal = {
                outline: node.style.outline,
                outlineOffset: node.style.outlineOffset,
                boxShadow: node.style.boxShadow,
                position: node.style.position,
                zIndex: node.style.zIndex
            };
        }
        node.classList.add(TEAL_HIGHLIGHT_CLASS);
        node.style.outline = '3px solid #0d9488';
        node.style.outlineOffset = '3px';
        node.style.boxShadow = '0 0 0 3px rgba(13, 148, 136, 0.3), 0 0 16px rgba(13, 148, 136, 0.55)';
        node.style.position = 'relative';
        node.style.zIndex = '999999';
    }

    /**
     * Places the violation hover card above or beside the element using viewport space,
     * horizontal centering with clamping, and flip-to-below when the card would clip the top
     * (e.g. nav under a fixed header).
     */
    static positionHmenuTooltipNear(element, tooltip) {
        const GAP = 10;
        const MARGIN = 8;
        const TIP_W = 224;

        const rect = element.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;

        tooltip.style.display = 'block';
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '-9999px';
        tooltip.style.top = '0';
        const tipH = Math.max(tooltip.offsetHeight || 0, 72);
        tooltip.style.visibility = '';

        let left = rect.left + rect.width / 2;
        left = Math.max(MARGIN + TIP_W / 2, Math.min(left, vw - MARGIN - TIP_W / 2));

        const spaceAbove = rect.top - MARGIN;
        const spaceBelow = vh - rect.bottom - MARGIN;
        const need = tipH + GAP;

        let placementBelow = false;

        if (spaceAbove < need && spaceBelow >= need) {
            placementBelow = true;
        } else if (spaceAbove >= need && spaceBelow < need) {
            placementBelow = false;
        } else if (spaceAbove >= need && spaceBelow >= need) {
            const wouldClipViewportTop = rect.top - GAP < tipH + MARGIN;
            placementBelow = wouldClipViewportTop;
        } else {
            placementBelow = spaceBelow >= spaceAbove;
        }

        if (!placementBelow) {
            const visualTop = rect.top - GAP - tipH;
            if (visualTop < MARGIN && spaceBelow >= Math.min(need, Math.round(tipH * 0.65))) {
                placementBelow = true;
            }
        }

        tooltip.style.left = `${left}px`;

        if (placementBelow) {
            tooltip.classList.add('axe-hmenu-popup--below');
            let top = rect.bottom + GAP;
            if (top + tipH > vh - MARGIN) {
                top = Math.max(MARGIN, vh - MARGIN - tipH);
            }
            tooltip.style.top = `${top}px`;
        } else {
            tooltip.classList.remove('axe-hmenu-popup--below');
            tooltip.style.top = `${rect.top - GAP}px`;
            const visualTop = rect.top - GAP - tipH;
            if (visualTop < MARGIN) {
                tooltip.style.top = `${MARGIN + tipH + GAP}px`;
            }
        }
    }

    static createHoverTooltip(element, data) {
        this.ensureHmenuStyles();

        const impact = (data?.impact || 'moderate').toLowerCase();
        const colors = IMPACT_COLORS[impact] || IMPACT_COLORS.moderate;
        const tags = (data?.wcag_tags || [])
            .filter(t => !t.includes('best-practice'))
            .slice(0, 4);
        const ruleTitle = data?.rule_title || data?.description || 'Accessibility violation';
        const affected = Number.isFinite(data?.affected_count) && data.affected_count > 0
            ? data.affected_count
            : 1;

        const tagsHtml = tags
            .map(t => `<span class="axe-hmenu-tag">${this.escapeHtml(t)}</span>`)
            .join('');

        const tooltip = document.createElement('div');
        tooltip.className = `${TEAL_TOOLTIP_CLASS} axe-hmenu-popup`;
        tooltip.style.display = 'none';
        tooltip.innerHTML = `
            <p class="axe-hmenu-label">Violation Rule</p>
            <p class="axe-hmenu-title">${this.escapeHtml(ruleTitle)}</p>
            <div class="axe-hmenu-divider"></div>
            <div class="axe-hmenu-row">
                <span class="axe-hmenu-key">Impact</span>
                <span class="axe-hmenu-impact" style="background:${colors.bg};color:${colors.text}">${this.escapeHtml(impact)}</span>
            </div>
            <div class="axe-hmenu-row">
                <span class="axe-hmenu-key">Affected</span>
                <span class="axe-hmenu-value">${affected} element${affected !== 1 ? 's' : ''}</span>
            </div>
            ${tags.length ? `<div class="axe-hmenu-tags">${tagsHtml}</div>` : ''}
            <div class="axe-hmenu-arrow" aria-hidden="true"></div>
        `;

        document.body.appendChild(tooltip);

        const showTooltip = () => {
            this.positionHmenuTooltipNear(element, tooltip);
        };

        const hideTooltip = () => {
            tooltip.style.display = 'none';
            tooltip.style.visibility = '';
        };

        element.__axeTealHandlers = { enter: showTooltip, leave: hideTooltip };
        element.__axeTealTooltip = tooltip;
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    }

    static clearTealHighlights() {
        document.querySelectorAll('.' + TEAL_HIGHLIGHT_CLASS).forEach(node => {
            node.classList.remove(TEAL_HIGHLIGHT_CLASS);

            // Remove hover tooltip and its event listeners
            if (node.__axeTealTooltip) {
                node.__axeTealTooltip.remove();
                delete node.__axeTealTooltip;
            }
            if (node.__axeTealHandlers) {
                node.removeEventListener('mouseenter', node.__axeTealHandlers.enter);
                node.removeEventListener('mouseleave', node.__axeTealHandlers.leave);
                delete node.__axeTealHandlers;
            }

            if (node.__axePrevStylesTeal) {
                node.style.outline = node.__axePrevStylesTeal.outline || '';
                node.style.outlineOffset = node.__axePrevStylesTeal.outlineOffset || '';
                node.style.boxShadow = node.__axePrevStylesTeal.boxShadow || '';
                node.style.position = node.__axePrevStylesTeal.position || '';
                node.style.zIndex = node.__axePrevStylesTeal.zIndex || '';
                delete node.__axePrevStylesTeal;
            } else {
                node.style.outline = '';
                node.style.outlineOffset = '';
                node.style.boxShadow = '';
                node.style.position = '';
                node.style.zIndex = '';
            }
        });

        // Safety: remove any orphaned tooltips
        document.querySelectorAll('.' + TEAL_TOOLTIP_CLASS).forEach(t => t.remove());

        const hmenuStyle = document.getElementById(HMENU_STYLE_ID);
        if (hmenuStyle) hmenuStyle.remove();
    }

    static highlightAll(selectorDataArray) {
        this.clearMainHighlight();
        this.clearTealHighlights();
        if (!Array.isArray(selectorDataArray) || selectorDataArray.length === 0) {
            return { found: false, count: 0 };
        }

        let count = 0;
        let firstElement = null;
        selectorDataArray.forEach(selectorData => {
            const { element } = DomModel.findElement(selectorData);
            if (element) {
                this.applyHighlightTeal(element);
                this.createHoverTooltip(element, selectorData);
                if (!firstElement) firstElement = element;
                count++;
            }
        });

        if (firstElement) {
            this.scrollIntoView(firstElement);
        }

        return { found: count > 0, count };
    }

    static clearAll() {
        this.clearMainHighlight();
        this.clearContrastHighlights();
        this.clearTealHighlights();
    }

    /**
     * Serializes the current document to a standalone HTML file, including extension
     * overlays and teal violation highlights. Tooltips use data-axe-export-tip + a
     * small injected script so hover works in the saved file (listeners are not kept by outerHTML).
     */
    static exportPageSnapshotHtml() {
        try {
            let tipIndex = 0;
            document.querySelectorAll('.' + TEAL_HIGHLIGHT_CLASS).forEach((node) => {
                if (!node.__axeTealTooltip) return;
                const id = 'axe-export-tip-' + tipIndex++;
                node.setAttribute('data-axe-export-tip', id);
                node.__axeTealTooltip.setAttribute('id', id);
            });

            const doctype = document.doctype
                ? new XMLSerializer().serializeToString(document.doctype) + '\n'
                : '<!DOCTYPE html>\n';

            let html = doctype + document.documentElement.outerHTML;

            document.querySelectorAll('[data-axe-export-tip]').forEach((el) => {
                el.removeAttribute('data-axe-export-tip');
            });
            document.querySelectorAll('[id^="axe-export-tip-"]').forEach((el) => {
                el.removeAttribute('id');
            });

            const baseUrl = (typeof location !== 'undefined' && location.href
                ? location.href.split('#')[0]
                : '');
            if (baseUrl && !/<base\s/i.test(html) && /<head[^>]*>/i.test(html)) {
                const safeBase = this.escapeHtmlAttr(baseUrl);
                html = html.replace(/<head[^>]*>/i, (open) => `${open}<base href="${safeBase}">`);
            }

            const exportHookScript = `
<script>
(function(){
var GAP=10,MARGIN=8,TIP_W=224;
function place(el,tip){
var r=el.getBoundingClientRect();
var vw=window.innerWidth||document.documentElement.clientWidth;
var vh=window.innerHeight||document.documentElement.clientHeight;
tip.style.display="block";
tip.style.visibility="hidden";
tip.style.left="-9999px";
tip.style.top="0";
var tipH=Math.max(tip.offsetHeight||0,72);
tip.style.visibility="";
var left=r.left+r.width/2;
left=Math.max(MARGIN+TIP_W/2,Math.min(left,vw-MARGIN-TIP_W/2));
var spaceAbove=r.top-MARGIN;
var spaceBelow=vh-r.bottom-MARGIN;
var need=tipH+GAP;
var below=false;
if(spaceAbove<need&&spaceBelow>=need){below=true;}
else if(spaceAbove>=need&&spaceBelow<need){below=false;}
else if(spaceAbove>=need&&spaceBelow>=need){below=(r.top-GAP<tipH+MARGIN);}
else{below=spaceBelow>=spaceAbove;}
if(!below){
var vTop=r.top-GAP-tipH;
if(vTop<MARGIN&&spaceBelow>=Math.min(need,Math.round(tipH*0.65))){below=true;}
}
tip.style.left=left+"px";
if(below){
tip.classList.add("axe-hmenu-popup--below");
var top=r.bottom+GAP;
if(top+tipH>vh-MARGIN){top=Math.max(MARGIN,vh-MARGIN-tipH);}
tip.style.top=top+"px";
}else{
tip.classList.remove("axe-hmenu-popup--below");
tip.style.top=(r.top-GAP)+"px";
var vt=r.top-GAP-tipH;
if(vt<MARGIN){tip.style.top=(MARGIN+tipH+GAP)+"px";}
}
}
function bind(){
document.querySelectorAll("[data-axe-export-tip]").forEach(function(el){
var id=el.getAttribute("data-axe-export-tip");
var tip=document.getElementById(id);
if(!tip)return;
el.addEventListener("mouseenter",function(){place(el,tip);});
el.addEventListener("mouseleave",function(){tip.style.display="none";tip.style.visibility="";});
});
}
bind();
function repositionOpenTips(){
document.querySelectorAll("[data-axe-export-tip]").forEach(function(el){
var tip=document.getElementById(el.getAttribute("data-axe-export-tip"));
if(tip&&tip.style.display==="block")place(el,tip);
});
}
window.addEventListener("scroll",repositionOpenTips,true);
window.addEventListener("resize",repositionOpenTips,true);
})();
</script>
`;

            if (/<\/body>/i.test(html)) {
                html = html.replace(/<\/body>/i, exportHookScript + '</body>');
            } else if (/<\/html>/i.test(html)) {
                html = html.replace(/<\/html>/i, exportHookScript + '</html>');
            } else {
                html += exportHookScript;
            }

            return { ok: true, html };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
        }
    }
}
