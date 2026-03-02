document.addEventListener('DOMContentLoaded', async () => {
  await initCookie();
  await updateSidebarUserInfo();

  const cookie = await api.getCookie();
  if (!cookie) document.getElementById('login-modal').style.display = 'block';

  document.getElementById('minimize-btn').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
  });
  document.getElementById('maximize-btn').addEventListener('click', () => {
    window.electronAPI.maximizeWindow();
  });
  document.getElementById('close-btn').addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });

  document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('login-modal').style.display = 'none';
  });

  document.querySelectorAll('.tab-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const tabId = e.target.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(tabId + '-tab').classList.add('active');
    });
  });

  document.getElementById('login-phone-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value;
    const pwd = document.getElementById('password-phone').value;
    const code = document.getElementById('countrycode').value;
    if (!phone || !pwd) return showToast('请输入手机号和密码');
    await loginWithPhone(phone, pwd, code);
    if (await api.getCookie()) {
      document.getElementById('login-modal').style.display = 'none';
      location.reload();
    }
  });

  document.getElementById('login-email-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pwd = document.getElementById('password-email').value;
    if (!email || !pwd) return showToast('请输入邮箱和密码');
    await loginWithEmail(email, pwd);
    if (await api.getCookie()) {
      document.getElementById('login-modal').style.display = 'none';
      location.reload();
    }
  });

  document.querySelector('[data-tab="qr"]').addEventListener('click', async () => {
    try {
      const { key, qrImage } = await qrLogin();
      document.getElementById('qr-image').src = qrImage;
      document.getElementById('qr-status').innerText = '请扫码';
      const poll = setInterval(async () => {
        const res = await checkQrStatus(key);
        if (res.code === 803) {
          clearInterval(poll);
          await api.setCookie(res.cookie);
          saveCookie(res.cookie);
          showToast('登录成功');
          document.getElementById('login-modal').style.display = 'none';
          location.reload();
        } else if (res.code === 800) {
          clearInterval(poll);
          document.getElementById('qr-status').innerText = '二维码已过期';
        } else if (res.code === 802) {
          document.getElementById('qr-status').innerText = '已扫码，请确认';
        }
      }, 2000);
    } catch (err) { showToast('二维码生成失败：' + err.message); }
  });

  let countdown = 0;
  const getCaptchaBtn = document.getElementById('get-captcha-btn');
  getCaptchaBtn.addEventListener('click', async () => {
    const phone = document.getElementById('captcha-phone').value;
    const ctcode = document.getElementById('captcha-countrycode').value;
    if (!phone) return showToast('请输入手机号');
    if (countdown > 0) return;
    const res = await sendCaptcha(phone, ctcode);
    if (res.code === 200) {
      countdown = 60;
      getCaptchaBtn.disabled = true;
      getCaptchaBtn.innerText = `60秒后重试`;
      const timer = setInterval(() => {
        countdown--;
        getCaptchaBtn.innerText = `${countdown}秒后重试`;
        if (countdown <= 0) {
          clearInterval(timer);
          getCaptchaBtn.disabled = false;
          getCaptchaBtn.innerText = '获取验证码';
        }
      }, 1000);
    }
  });

  document.getElementById('login-captcha-btn').addEventListener('click', async () => {
    const phone = document.getElementById('captcha-phone').value;
    const captcha = document.getElementById('captcha-code').value;
    const ctcode = document.getElementById('captcha-countrycode').value;
    if (!phone || !captcha) return showToast('请输入手机号和验证码');
    await loginWithCaptcha(phone, captcha, ctcode);
    if (await api.getCookie()) {
      document.getElementById('login-modal').style.display = 'none';
      location.reload();
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    clearCookie();
    await api.setCookie('');
    location.reload();
  });

  document.querySelectorAll('.nav li').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav li').forEach(li => li.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      document.getElementById('current-view-title').innerText = item.innerText.trim();
      if (view === 'home') loadHomeView();
      else if (view === 'discover') loadDiscoverView();
      else if (view === 'playlist') loadPlaylistView();
      else if (view === 'search') loadSearchView();
      else if (view === 'profile') loadProfileView();
      else document.getElementById('content-view').innerHTML = '<p>开发中……</p>';
    });
  });

  document.getElementById('search-btn').addEventListener('click', () => {
    const keyword = document.getElementById('global-search').value.trim();
    if (keyword) {
      document.querySelectorAll('.nav li').forEach(li => li.classList.remove('active'));
      document.querySelector('[data-view="search"]').classList.add('active');
      document.getElementById('current-view-title').innerText = '搜索';
      loadSearchView(keyword);
    }
  });

  const audio = new Audio();
  let currentPlaylist = [];
  let currentIndex = -1;
  let playMode = 'repeat';
  let isFromPlaylist = false;

  let lyricWindowOpen = false;
  let currentLyrics = [];
  let currentSongTitle = '';
  let currentSongCover = '';

  let audioContext = null;
  let analyser = null;
  let source = null;
  let animationFrame = null;

  let preloadedSong = null;

  const modeIcons = {
    repeat: 'fa-repeat',
    loop: 'fa-list',
    random: 'fa-random'
  };
  const modeTooltips = {
    repeat: '单曲循环',
    loop: '列表循环',
    random: '随机播放'
  };

  function updateModeButton() {
    const btn = document.getElementById('mode-btn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    icon.className = `fas ${modeIcons[playMode]}`;
    btn.title = modeTooltips[playMode];
    if (!isFromPlaylist) {
      btn.style.opacity = '0.3';
      btn.style.pointerEvents = 'none';
    } else {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }

  document.getElementById('mode-btn')?.addEventListener('click', () => {
    if (!isFromPlaylist) return;
    const modes = ['repeat', 'loop', 'random'];
    const idx = modes.indexOf(playMode);
    playMode = modes[(idx + 1) % modes.length];
    updateModeButton();
    showToast(`播放模式：${modeTooltips[playMode]}`);
  });

  function initAudioAnalyser() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
    }
  }

  function startVisualization() {
    if (!lyricWindowOpen || !analyser) return;
    if (animationFrame) {
      clearInterval(animationFrame);
      animationFrame = null;
    }
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    animationFrame = setInterval(() => {
      if (!lyricWindowOpen) {
        clearInterval(animationFrame);
        animationFrame = null;
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      window.electronAPI.sendVisualizationData(Array.from(dataArray));
    }, 50);
  }

  function stopVisualization() {
    if (animationFrame) {
      clearInterval(animationFrame);
      animationFrame = null;
    }
  }

  window.electronAPI.onLyricWindowClosed(() => {
    lyricWindowOpen = false;
    stopVisualization();
    const btn = document.getElementById('lyric-btn');
    if (btn) {
      btn.classList.remove('active');
      btn.style.color = '#888';
    }
  });

  const lyricBtn = document.getElementById('lyric-btn');
  lyricBtn.addEventListener('click', () => {
    if (lyricWindowOpen) {
      window.electronAPI.closeLyricWindow();
      lyricBtn.classList.remove('active');
      lyricBtn.style.color = '#888';
      lyricWindowOpen = false;
      stopVisualization();
    } else {
      window.electronAPI.openLyricWindow();
      lyricBtn.classList.add('active');
      lyricBtn.style.color = '#fff';
      lyricWindowOpen = true;
      if (window.currentSongId) {
        window.electronAPI.sendLyricData({
          lyrics: currentLyrics,
          cover: currentSongCover,
          title: currentSongTitle
        });
        console.log("发送歌词数据到窗口，数量:", currentLyrics.length);
      } else if (window.currentSongId) {
        loadLyrics(window.currentSongId);
      }
      if (audio.src && !audio.paused) {
        startVisualization();
      }
    }
  });

  async function loadLyrics(songId) {
    try {
      const res = await api.request('GET', '/lyric', { id: songId });
      if (res.code === 200 && res.lrc && res.lrc.lyric) {
        const raw = res.lrc.lyric;
        const lines = raw.split('\n');
        const parsed = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        lines.forEach(line => {
          const match = line.match(timeRegex);
          if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const milliseconds = parseInt(match[3]) * (match[3].length === 2 ? 10 : 1);
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
              parsed.push({ time, text });
            }
          }
        });
        parsed.sort((a, b) => a.time - b.time);
        currentLyrics = parsed;
        if (lyricWindowOpen) {
          window.electronAPI.sendLyricData({
            lyrics: currentLyrics,
            cover: currentSongCover,
            title: currentSongTitle
          });
          console.log("发送歌词数据到窗口，数量:", currentLyrics.length);
        }
      } else {
        currentLyrics = [];
        if (lyricWindowOpen) {
          window.electronAPI.sendLyricData({
            lyrics: [],
            cover: currentSongCover,
            title: currentSongTitle
          });
          console.log("发送歌词数据到窗口，数量:", currentLyrics.length);
        }
      }
    } catch (err) {
      currentLyrics = [];
      if (lyricWindowOpen) {
        window.electronAPI.sendLyricData({
          lyrics: [],
          cover: currentSongCover,
          title: currentSongTitle
        });
        console.log("发送歌词数据到窗口，数量:", currentLyrics.length);
      }
    }
  }

  window.playSong = async (id, name, artists, cover, playlist = null) => {
    preloadedSong = null;

    const res = await fetchSongUrlV1(id);
    if (res.code === 200 && res.data[0] && res.data[0].url) {
      audio.src = res.data[0].url;
      audio.play();
      document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
      document.getElementById('player-title').innerText = name;
      document.getElementById('player-artist').innerText = artists.map(a => a.name).join('/');
      document.getElementById('player-cover').src = cover || 'assets/default-cover.png';
      
      window.currentSongId = id;
      currentSongTitle = name;
      currentSongCover = cover || 'assets/default-cover.png';

      if (playlist && playlist.length > 0) {
        currentPlaylist = playlist;
        currentIndex = currentPlaylist.findIndex(item => item.id == id);
        isFromPlaylist = true;
      } else {
        currentPlaylist = [];
        currentIndex = -1;
        isFromPlaylist = false;
        playMode = 'repeat';
      }
      updateModeButton();

      await loadLyrics(id);

      if (!audioContext) {
        initAudioAnalyser();
      } else if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      if (lyricWindowOpen) {
        startVisualization();
      }
    } else showToast('无法播放，可能无版权');
  };

  document.getElementById('next-btn').addEventListener('click', () => {
    if (!isFromPlaylist || currentPlaylist.length === 0) return;
    let nextIndex = -1;
    if (playMode === 'random') {
      if (currentPlaylist.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (nextIndex === currentIndex);
      } else {
        nextIndex = 0;
      }
    } else {
      nextIndex = (currentIndex + 1) % currentPlaylist.length;
    }
    if (nextIndex !== -1) {
      const next = currentPlaylist[nextIndex];
      playSong(next.id, next.name, next.artists, next.cover, currentPlaylist);
      currentIndex = nextIndex;
    }
  });

  document.getElementById('prev-btn').addEventListener('click', () => {
    if (!isFromPlaylist || currentPlaylist.length === 0) return;
    let prevIndex = -1;
    if (playMode === 'random') {
      if (currentPlaylist.length > 1) {
        do {
          prevIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (prevIndex === currentIndex);
      } else {
        prevIndex = 0;
      }
    } else {
      prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    }
    if (prevIndex !== -1) {
      const prev = currentPlaylist[prevIndex];
      playSong(prev.id, prev.name, prev.artists, prev.cover, currentPlaylist);
      currentIndex = prevIndex;
    }
  });

  audio.addEventListener('ended', () => {
    if (playMode === 'repeat') {
      audio.currentTime = 0;
      audio.play();
    } else if (isFromPlaylist && currentPlaylist.length > 0) {
      if (preloadedSong && preloadedSong.url) {
        const next = preloadedSong;
        audio.src = next.url;
        audio.play();
        document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
        document.getElementById('player-title').innerText = next.name;
        document.getElementById('player-artist').innerText = next.artists.map(a => a.name).join('/');
        document.getElementById('player-cover').src = next.cover || 'assets/default-cover.png';
        
        window.currentSongId = next.id;
        currentSongTitle = next.name;
        currentSongCover = next.cover || 'assets/default-cover.png';
        currentIndex = next.index;
        loadLyrics(next.id);
        
        preloadedSong = null;
      } else {
        document.getElementById('next-btn').click();
      }
    }
  });

  document.getElementById('play-pause-btn').addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-pause"></i>';
      if (lyricWindowOpen) startVisualization();
    } else {
      audio.pause();
      document.getElementById('play-pause-btn').innerHTML = '<i class="fas fa-play"></i>';
      stopVisualization();
    }
  });

  audio.addEventListener('timeupdate', () => {
    const p = (audio.currentTime / audio.duration) * 100 || 0;
    document.getElementById('progress-slider').value = p;
    document.getElementById('current-time').innerText = formatTime(audio.currentTime);
    document.getElementById('duration').innerText = formatTime(audio.duration);
    if (lyricWindowOpen) {
      window.electronAPI.updateLyricTime(audio.currentTime);
    }

    if (isFromPlaylist && currentPlaylist.length > 0 && playMode !== 'repeat') {
      const remaining = audio.duration - audio.currentTime;
      if (remaining <= 15 && remaining > 0 && !preloadedSong) {
        let nextIndex = -1;
        if (playMode === 'random') {
          if (currentPlaylist.length > 1) {
            do {
              nextIndex = Math.floor(Math.random() * currentPlaylist.length);
            } while (nextIndex === currentIndex);
          } else {
            nextIndex = 0;
          }
        } else {
          nextIndex = (currentIndex + 1) % currentPlaylist.length;
        }
        const nextSong = currentPlaylist[nextIndex];
        (async () => {
          try {
            const res = await fetchSongUrlV1(nextSong.id);
            if (res.code === 200 && res.data[0] && res.data[0].url) {
              preloadedSong = {
                url: res.data[0].url,
                id: nextSong.id,
                name: nextSong.name,
                artists: nextSong.artists,
                cover: nextSong.cover,
                index: nextIndex
              };
              console.log('预加载下一首成功:', nextSong.name);
            } else {
              console.log('预加载失败，无法获取URL');
            }
          } catch (err) {
            console.error('预加载出错:', err);
          }
        })();
      }
    }
  });

  document.getElementById('progress-slider').addEventListener('input', (e) => {
    audio.currentTime = (e.target.value / 100) * audio.duration;
  });
  document.getElementById('volume-slider').addEventListener('input', (e) => {
    audio.volume = e.target.value;
  });

  window.electronAPI.onRequestLyricData(() => {
    console.log("收到歌词数据请求，当前歌词长度:", currentLyrics.length);
    if (window.currentSongId) {
      window.electronAPI.sendLyricData({
        lyrics: currentLyrics,
        cover: currentSongCover,
        title: currentSongTitle
      });
      console.log("发送歌词数据到窗口，数量:", currentLyrics.length);
    } else if (window.currentSongId) {
      loadLyrics(window.currentSongId);
    }
  });

  updateModeButton();
  loadHomeView();
});

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
function parseDuration(ms) { return formatTime(ms / 1000); }

async function updateSidebarUserInfo() {
  try {
    const accountRes = await api.request('GET', '/user/account');
    if (accountRes.code === 200 && accountRes.profile) {
      const profile = accountRes.profile;
      document.getElementById('avatar').src = profile.avatarUrl + '?param=50y50';
      document.getElementById('nickname').innerText = profile.nickname;
    } else {
      document.getElementById('avatar').src = 'assets/default-avatar.png';
      document.getElementById('nickname').innerText = '未登录';
    }
  } catch (err) {
    document.getElementById('avatar').src = 'assets/default-avatar.png';
    document.getElementById('nickname').innerText = '未登录';
  }
}

async function loadHomeView() {
  const view = document.getElementById('content-view');
  view.innerHTML = '<div class="section-title">推荐歌单</div><div class="card-grid" id="recommend-playlist"></div>';
  try {
    const res = await fetchPersonalizedPlaylist(10);
    if (res.code === 200 && res.result) {
      const grid = document.getElementById('recommend-playlist');
      res.result.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${item.picUrl}?param=200y200"><div class="card-title">${item.name}</div>`;
        card.addEventListener('click', () => loadPlaylistDetail(item.id));
        grid.appendChild(card);
      });
    }
  } catch { view.innerHTML = '<p>加载失败</p>'; }
}

async function loadDiscoverView() {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <div class="section-title">推荐歌单</div>
    <div class="card-grid" id="discover-playlist"></div>
    <div class="section-title" style="margin-top:30px;">新歌速递</div>
    <div class="card-grid" id="new-songs"></div>
  `;
  try {
    const playlistRes = await fetchPersonalizedPlaylist(10);
    if (playlistRes.code === 200) {
      const grid = document.getElementById('discover-playlist');
      playlistRes.result.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${item.picUrl}?param=200y200"><div class="card-title">${item.name}</div>`;
        card.addEventListener('click', () => loadPlaylistDetail(item.id));
        grid.appendChild(card);
      });
    }
    const newSongsRes = await fetchNewSongs(7);
    if (newSongsRes.code === 200) {
      const grid = document.getElementById('new-songs');
      newSongsRes.data.slice(0, 10).forEach(song => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${song.album.picUrl}?param=200y200"><div class="card-title">${song.name}</div><div class="card-sub">${song.artists[0].name}</div>`;
        card.addEventListener('click', () => playSong(song.id, song.name, song.artists, song.album.picUrl));
        grid.appendChild(card);
      });
    }
  } catch (err) { view.innerHTML = '<p>加载失败</p>'; }
}

async function loadPlaylistView(cat = '全部') {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;" id="cat-buttons"></div>
    <div class="card-grid" id="playlist-grid"></div>
    <div style="text-align:center; margin-top:20px;" id="playlist-pagination"></div>
  `;
  let currentOffset = 0;
  const limit = 20;
  async function loadPlaylists(cat, offset) {
    const res = await fetchTopPlaylist(cat, limit, offset);
    if (res.code === 200) {
      const grid = document.getElementById('playlist-grid');
      grid.innerHTML = '';
      res.playlists.forEach(pl => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${pl.coverImgUrl}?param=200y200"><div class="card-title">${pl.name}</div><div class="card-sub">${pl.trackCount}首</div>`;
        card.addEventListener('click', () => loadPlaylistDetail(pl.id));
        grid.appendChild(card);
      });
      document.getElementById('playlist-pagination').innerHTML = `
        <button id="prev-page" ${offset === 0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> 上一页</button>
        <span>第${offset/limit+1}页</span>
        <button id="next-page" ${res.more ? '' : 'disabled'}>下一页 <i class="fas fa-chevron-right"></i></button>
      `;
      document.getElementById('prev-page')?.addEventListener('click', () => {
        currentOffset -= limit;
        loadPlaylists(cat, currentOffset);
      });
      document.getElementById('next-page')?.addEventListener('click', () => {
        currentOffset += limit;
        loadPlaylists(cat, currentOffset);
      });
    }
  }
  const catRes = await fetchPlaylistCatlist();
  if (catRes.code === 200) {
    const cats = ['全部', ...catRes.sub.slice(0, 15).map(c => c.name)];
    const btnContainer = document.getElementById('cat-buttons');
    cats.forEach(c => {
      const btn = document.createElement('button');
      btn.textContent = c;
      btn.style.cssText = 'padding:5px 15px; background:rgba(255,255,255,0.1); border:none; border-radius:20px; color:#fff; cursor:pointer; transition:0.2s;';
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.2)');
      btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,0.1)');
      btn.addEventListener('click', () => {
        loadPlaylists(c, 0);
      });
      btnContainer.appendChild(btn);
    });
  }
  loadPlaylists(cat, 0);
}

async function loadSearchView(keyword = '') {
  const view = document.getElementById('content-view');
  view.innerHTML = `
    <div class="search-tabs">
      <span class="search-tab active" data-type="1">单曲</span>
      <span class="search-tab" data-type="10">专辑</span>
      <span class="search-tab" data-type="100">歌手</span>
      <span class="search-tab" data-type="1000">歌单</span>
    </div>
    <div id="search-result"></div>
  `;
  const searchInput = document.getElementById('global-search');
  if (keyword) searchInput.value = keyword;
  let currentType = 1;
  let currentKeyword = keyword;

  async function doSearch(type, kw) {
    if (!kw) return;
    const res = await search(kw, type, 20);
    const resultDiv = document.getElementById('search-result');
    if (res.code !== 200) return;
    if (type === 1) {
      if (!res.result.songs) { resultDiv.innerHTML = '<p>无结果</p>'; return; }
      let html = '<ul class="track-list">';
      res.result.songs.forEach((song, i) => {
        html += `<li class="track-item" data-id="${song.id}" data-name="${song.name}" data-artists='${JSON.stringify(song.artists)}' data-album="${song.album.picUrl}">
          <span class="track-index">${i+1}</span>
          <div class="track-info"><span class="track-name">${song.name}</span><span class="track-artist">${song.artists.map(a => a.name).join('/')}</span></div>
          <span class="track-duration">${parseDuration(song.duration)}</span></li>`;
      });
      html += '</ul>';
      resultDiv.innerHTML = html;
      resultDiv.querySelectorAll('.track-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const name = item.dataset.name;
          const artists = JSON.parse(item.dataset.artists);
          const cover = item.dataset.album;
          playSong(id, name, artists, cover);
        });
      });
    } else if (type === 1000) {
      if (!res.result.playlists) { resultDiv.innerHTML = '<p>无结果</p>'; return; }
      let html = '<div class="card-grid">';
      res.result.playlists.forEach(pl => {
        html += `<div class="card" data-id="${pl.id}">
          <img src="${pl.coverImgUrl}?param=200y200">
          <div class="card-title">${pl.name}</div>
        </div>`;
      });
      html += '</div>';
      resultDiv.innerHTML = html;
      resultDiv.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => loadPlaylistDetail(card.dataset.id));
      });
    } else {
      resultDiv.innerHTML = '<p>该类型暂未实现展示</p>';
    }
  }

  document.querySelectorAll('.search-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentType = parseInt(e.target.dataset.type);
      if (currentKeyword) doSearch(currentType, currentKeyword);
    });
  });

  if (currentKeyword) doSearch(currentType, currentKeyword);
}

async function loadProfileView() {
  const view = document.getElementById('content-view');
  view.innerHTML = '<p>加载中...</p>';
  try {
    const accountRes = await api.request('GET', '/user/account');
    if (accountRes.code !== 200) throw new Error('获取账户失败');
    const uid = accountRes.profile.userId;
    const detailRes = await fetchUserDetail(uid);
    if (detailRes.code !== 200) throw new Error('获取详情失败');
    const user = detailRes.profile;
    const playlistRes = await fetchUserPlaylist(uid, 10);
    let playlistsHtml = '';
    if (playlistRes.code === 200) {
      playlistsHtml = '<div class="section-title">我的歌单</div><div class="card-grid">';
      playlistRes.playlist.slice(0, 6).forEach(pl => {
        playlistsHtml += `<div class="card" data-id="${pl.id}">
          <img src="${pl.coverImgUrl}?param=200y200">
          <div class="card-title">${pl.name}</div>
        </div>`;
      });
      playlistsHtml += '</div>';
    }
    const html = `
      <div class="profile-header">
        <img src="${user.avatarUrl}?param=200y200" class="profile-avatar">
        <div class="profile-info">
          <h2>${user.nickname}</h2>
          <div class="profile-level">等级 ${user.level || '?'}</div>
          <div class="profile-stats">
            <div class="stat"><span class="stat-number">${user.follows || 0}</span><span class="stat-label">关注</span></div>
            <div class="stat"><span class="stat-number">${user.followeds || 0}</span><span class="stat-label">粉丝</span></div>
            <div class="stat"><span class="stat-number">${user.eventCount || 0}</span><span class="stat-label">动态</span></div>
          </div>
        </div>
      </div>
      ${playlistsHtml}
    `;
    view.innerHTML = html;
    view.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => loadPlaylistDetail(card.dataset.id));
    });
    await updateSidebarUserInfo();
  } catch (err) {
    view.innerHTML = '<p>加载失败，请先登录</p>';
  }
}

async function loadPlaylistDetail(id) {
  const view = document.getElementById('content-view');
  view.innerHTML = '<p>加载歌单详情...</p>';
  try {
    const detail = await fetchPlaylistDetail(id);
    if (detail.code !== 200) throw new Error();
    const pl = detail.playlist;
    let tracks = pl.tracks;
    if (pl.trackCount > pl.tracks.length) {
      const allRes = await fetchPlaylistAllTracks(id, pl.trackCount);
      if (allRes.code === 200 && allRes.songs) tracks = allRes.songs;
    }
    const playlistItems = tracks.map(t => ({
      id: t.id,
      name: t.name,
      artists: t.ar || t.artists,
      cover: (t.al?.picUrl || t.album?.picUrl) + '?param=200y200'
    }));

    let html = `
      <div style="display:flex; gap:20px; margin-bottom:30px;">
        <img src="${pl.coverImgUrl}?param=300y300" style="width:200px; border-radius:10px;">
        <div>
          <h2>${pl.name}</h2>
          <p>${pl.description || ''}</p>
          <p>创建者: ${pl.creator.nickname}  歌曲: ${pl.trackCount}</p>
        </div>
      </div>
      <ul class="track-list">
    `;
    tracks.forEach((t, i) => {
      const artists = t.ar || t.artists;
      const picUrl = t.al?.picUrl || t.album?.picUrl || '';
      html += `<li class="track-item" data-id="${t.id}" data-name="${t.name}" data-artists='${JSON.stringify(artists)}' data-album="${picUrl}" data-index="${i}">
        <span class="track-index">${i+1}</span>
        <div class="track-info"><span class="track-name">${t.name}</span><span class="track-artist">${artists.map(a => a.name).join('/')}</span></div>
        <span class="track-duration">${parseDuration(t.dt || t.duration)}</span></li>`;
    });
    html += '</ul>';
    view.innerHTML = html;
    view.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const name = item.dataset.name;
        const artists = JSON.parse(item.dataset.artists);
        const cover = item.dataset.album;
        playSong(id, name, artists, cover, playlistItems);
      });
    });
  } catch (err) {
    view.innerHTML = '<p>加载歌单详情失败</p>';
  }
}