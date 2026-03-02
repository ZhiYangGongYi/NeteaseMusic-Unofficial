const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  openLyricWindow: () => ipcRenderer.send('open-lyric-window'),
  closeLyricWindow: () => ipcRenderer.send('close-lyric-window'),
  updateLyricTime: (time) => ipcRenderer.send('update-lyric-time', time),
  sendLyricData: (data) => ipcRenderer.send('send-lyric-data', data),
  onLyricWindowClosed: (callback) => ipcRenderer.on('lyric-window-closed', callback),
  onRequestLyricData: (callback) => ipcRenderer.on('request-lyric-data-from-main', callback),
  requestLyricData: () => ipcRenderer.send('request-lyric-data'),

  sendVisualizationData: (data) => ipcRenderer.send('send-visualization-data', data),
  onVisualizationData: (callback) => ipcRenderer.on('visualization-data', (event, data) => callback(data)),

  onLyricData: (callback) => ipcRenderer.on('lyric-data', (event, data) => callback(data)),
  onLyricTime: (callback) => ipcRenderer.on('lyric-time', (event, time) => callback(time)),

  request: (method, endpoint, params, body) =>
    ipcRenderer.invoke('api-request', { method, endpoint, params, body }),

  loginWithPhone: (phone, password, countrycode) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login/cellphone',
      params: { phone, password, countrycode, timestamp: Date.now() },
    }),
  loginWithEmail: (email, password) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login',
      params: { email, password, timestamp: Date.now() },
    }),
  sendCaptcha: (phone, ctcode) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/captcha/sent',
      params: { phone, ctcode, timestamp: Date.now() },
    }),
  loginWithCaptcha: (phone, captcha, ctcode) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login/cellphone',
      params: { phone, captcha, ctcode, timestamp: Date.now() },
    }),
  getQrKey: () =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login/qr/key',
      params: { timestamp: Date.now() },
    }),
  createQr: (key) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login/qr/create',
      params: { key, qrimg: true, timestamp: Date.now() },
    }),
  checkQr: (key) =>
    ipcRenderer.invoke('api-request', {
      method: 'GET',
      endpoint: '/login/qr/check',
      params: { key, timestamp: Date.now() },
    }),

  getPlaylistDetail: (id) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/playlist/detail', params: { id } }),
  getPlaylistAllTracks: (id, limit, offset) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/playlist/track/all', params: { id, limit, offset } }),

  getSongUrl: (id, br = 999000) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/song/url', params: { id, br } }),
  getSongDetail: (ids) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/song/detail', params: { ids } }),

  search: (keywords, type, limit, offset) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/search', params: { keywords, type, limit, offset } }),

  getUserDetail: (uid) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/user/detail', params: { uid } }),
  getUserPlaylist: (uid, limit, offset) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/user/playlist', params: { uid, limit, offset } }),

  getPersonalizedPlaylist: (limit) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/personalized', params: { limit } }),
  getTopPlaylist: (cat, limit, offset) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/top/playlist', params: { cat, limit, offset } }),
  getNewSongs: (type) =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/top/song', params: { type } }),
  getPlaylistCatlist: () =>
    ipcRenderer.invoke('api-request', { method: 'GET', endpoint: '/playlist/catlist' }),

  generateQRCode: (text) => ipcRenderer.invoke('generate-qrcode', text),

  getCookie: () => ipcRenderer.invoke('get-cookie'),
  setCookie: (cookie) => ipcRenderer.invoke('set-cookie', cookie),
});