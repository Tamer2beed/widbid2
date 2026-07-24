/* message-actions.js — قائمة الضغط على نص الرسالة: نسخ النص / رد. */

let msgActionsTargetId = null;
let currentReplyTarget = null;

function positionGenericPanel(panelSelector, triggerEl) {
    const panel = document.querySelector(panelSelector);
    if (!panel) return;
    if (!triggerEl) { panel.style.top = '70px'; panel.style.left = '10px'; return; }
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const panelWidth = Math.min(200, vw - 16);
    let left = rect.right - panelWidth;
    if (left < 8) left = 8;
    if (left + panelWidth > vw - 8) left = vw - panelWidth - 8;
    const spaceBelow = vh - rect.bottom, spaceAbove = rect.top;
    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.width = panelWidth + 'px';
    if (spaceBelow >= 130 || spaceBelow >= spaceAbove) { panel.style.top = (rect.bottom + 6) + 'px'; panel.style.bottom = 'auto'; }
    else { panel.style.bottom = (vh - rect.top + 6) + 'px'; panel.style.top = 'auto'; }
}

function openMessageActionsMenu(msgId, triggerEl) {
    msgActionsTargetId = msgId;
    positionGenericPanel('#messageActionsModal .message-actions-panel', triggerEl);
    const modal = document.getElementById('messageActionsModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('panel-visible')));
}

function closeMessageActionsMenu() {
    const modal = document.getElementById('messageActionsModal');
    if (!modal) return;
    modal.classList.remove('panel-visible');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

async function copyMessageText() {
    const entry = (typeof messageRegistry !== 'undefined') ? messageRegistry[msgActionsTargetId] : null;
    closeMessageActionsMenu();
    if (!entry) return;
    try {
        await navigator.clipboard.writeText(entry.text);
        if (typeof showNotification === 'function') showNotification('📋 تم نسخ النص', 'join');
    } catch (e) {
        if (typeof showNotification === 'function') showNotification('تعذّر النسخ', 'leave');
    }
}

function startReply() {
    const entry = (typeof messageRegistry !== 'undefined') ? messageRegistry[msgActionsTargetId] : null;
    closeMessageActionsMenu();
    if (!entry) return;
    currentReplyTarget = { id: msgActionsTargetId, sender: entry.sender, text: entry.text };
    const senderEl = document.getElementById('replyPreviewSender');
    const textEl = document.getElementById('replyPreviewText');
    if (senderEl) senderEl.textContent = 'رد على ' + entry.sender;
    if (textEl) textEl.textContent = entry.text;
    document.getElementById('replyPreviewBar')?.classList.remove('hidden');
    document.getElementById('chatInput')?.focus();
}

function cancelReply() {
    currentReplyTarget = null;
    document.getElementById('replyPreviewBar')?.classList.add('hidden');
}

function buildReplyQuoteHtml() {
    if (!currentReplyTarget) return '';
    const safe = (typeof sanitize === 'function') ? sanitize : String;
    return `<div class="reply-quote-block" data-target-msg="${currentReplyTarget.id}"><span class="reply-quote-sender">${safe(currentReplyTarget.sender)}</span><span class="reply-quote-text">${safe(currentReplyTarget.text)}</span></div>`;
}
