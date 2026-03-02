const api = window.electronAPI;

function showToast(message, duration = 2000) {
  let toast = document.getElementById('custom-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'custom-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function saveCookie(cookie) { if (cookie) localStorage.setItem('music_cookie', cookie); }
function loadCookie() { return localStorage.getItem('music_cookie') || ''; }
function clearCookie() { localStorage.removeItem('music_cookie'); }

async function loginWithPhone(phone, password, countrycode) {
  const res = await api.loginWithPhone(phone, password, countrycode);
  if (res.code === 200) {
    const cookie = await api.getCookie();
    saveCookie(cookie);
    showToast('登录成功');
  } else {
    showToast(res.msg || '登录失败');
  }
  return res;
}
async function loginWithEmail(email, password) {
  const res = await api.loginWithEmail(email, password);
  if (res.code === 200) {
    const cookie = await api.getCookie();
    saveCookie(cookie);
    showToast('登录成功');
  } else {
    showToast(res.msg || '登录失败');
  }
  return res;
}
async function sendCaptcha(phone, ctcode = '86') {
  const res = await api.sendCaptcha(phone, ctcode);
  if (res.code === 200) showToast('验证码发送成功');
  else showToast(res.msg || '发送失败');
  return res;
}
async function loginWithCaptcha(phone, captcha, ctcode = '86') {
  const res = await api.loginWithCaptcha(phone, captcha, ctcode);
  if (res.code === 200) {
    const cookie = await api.getCookie();
    saveCookie(cookie);
    showToast('登录成功');
  } else {
    showToast(res.msg || '登录失败');
  }
  return res;
}
async function qrLogin() {
  const keyRes = await api.getQrKey();
  if (keyRes.code !== 200) throw new Error('获取key失败');
  const key = keyRes.data.unikey;
  const qrRes = await api.createQr(key);
  return { key, qrImage: qrRes.data.qrimg };
}
async function checkQrStatus(key) { return await api.checkQr(key); }
async function fetchPlaylistDetail(id) { return await api.getPlaylistDetail(id); }
async function fetchPlaylistAllTracks(id, limit = 100, offset = 0) { return await api.getPlaylistAllTracks(id, limit, offset); }
async function fetchSongUrl(id) { return await api.getSongUrl(id); }
async function fetchSongDetail(ids) { return await api.getSongDetail(ids); }
async function search(keywords, type = 1, limit = 30, offset = 0) { return await api.search(keywords, type, limit, offset); }
async function fetchUserDetail(uid) { return await api.getUserDetail(uid); }
async function fetchUserPlaylist(uid, limit = 30, offset = 0) { return await api.getUserPlaylist(uid, limit, offset); }
async function fetchPersonalizedPlaylist(limit = 10) { return await api.getPersonalizedPlaylist(limit); }
async function fetchTopPlaylist(cat = '全部', limit = 20, offset = 0) { return await api.getTopPlaylist(cat, limit, offset); }
async function fetchNewSongs(type = 0) { return await api.getNewSongs(type); }
async function fetchPlaylistCatlist() { return await api.getPlaylistCatlist(); }

async function initCookie() {
  const saved = loadCookie();
  if (saved) { await api.setCookie(saved); return true; }
  return false;
}

async function fetchSongUrlV1(id, level = 'standard', unblock = true) {
  return await api.request('GET', '/song/url/v1', { id, level, unblock, timestamp: Date.now() });
}
