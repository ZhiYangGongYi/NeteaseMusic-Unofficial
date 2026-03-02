function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
function parseDuration(ms) { return formatTime(ms / 1000); }
function saveCookie(cookie) { if (cookie) localStorage.setItem('music_cookie', cookie); }
function loadCookie() { return localStorage.getItem('music_cookie') || ''; }
function clearCookie() { localStorage.removeItem('music_cookie'); }
