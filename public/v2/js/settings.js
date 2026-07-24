let globalFontSize = localStorage.getItem('userFontSize') || '14px';
let globalFontColor = localStorage.getItem('userFontColor') || '#1f2937';
let globalFontWeight = localStorage.getItem('userFontWeight') || 'normal';
let globalPMPrivacy = localStorage.getItem('userPMPrivacy') || 'members_only';

function applyUserInterfaceSettings() {
    document.querySelectorAll('.chat-msg-text').forEach(p => {
        p.style.fontSize = globalFontSize;
        p.style.fontWeight = globalFontWeight;
    });
}
