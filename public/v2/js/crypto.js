/* crypto.js — تشفير كلمات المرور بمعيار SHA-256 (Web Crypto API المدمج بالمتصفح). */
async function hashPassword(pw) {
    try {
        const enc = new TextEncoder().encode(String(pw));
        const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
        console.error('فشل تشفير كلمة المرور:', err);
        return null;
    }
}
