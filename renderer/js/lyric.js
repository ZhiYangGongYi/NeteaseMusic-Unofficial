let lyrics = [];
let songCover = '';
let songTitle = '';
let currentTime = 0;
let lyricLines = [];

function renderLyrics() {
  const container = document.getElementById('lyric-content');
  if (!container) return;
  if (lyrics.length === 0) {
    container.innerHTML = '<div class="lyric-line">暂无歌词</div>';
    lyricLines = [];
    return;
  }
  const reversed = [...lyrics].reverse();
  let html = '';
  reversed.forEach((l, idx) => {
    const originalIndex = lyrics.length - 1 - idx;
    html += `<div class="lyric-line" data-time="${l.time}" data-original-index="${originalIndex}">${l.text}</div>`;
  });
  container.innerHTML = html;
  lyricLines = Array.from(document.querySelectorAll('.lyric-line'));
  highlightCurrentLyric();
}

function highlightCurrentLyric() {
  if (!lyrics.length) return;
  const container = document.getElementById('lyric-content');
  if (!container) return;
  let activeOriginalIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      activeOriginalIndex = i;
    } else {
      break;
    }
  }
  if (activeOriginalIndex === -1) activeOriginalIndex = 0;
  let activeLine = null;
  lyricLines.forEach(line => {
    const origIdx = parseInt(line.dataset.originalIndex);
    if (origIdx === activeOriginalIndex) {
      activeLine = line;
    }
  });
  if (!activeLine) return;
  lyricLines.forEach(line => line.classList.remove('active', 'near'));
  activeLine.classList.add('active');
  lyricLines.forEach(line => {
    const origIdx = parseInt(line.dataset.originalIndex);
    if (Math.abs(origIdx - activeOriginalIndex) === 1) {
      line.classList.add('near');
    }
  });

  const containerHeight = container.clientHeight;
  const lineHeight = activeLine.clientHeight;
  let targetScroll = activeLine.offsetTop + lineHeight - 0.9 * containerHeight;
  const maxScroll = container.scrollHeight - containerHeight;
  targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
  container.scrollTop = targetScroll;
}

function updateSongInfo() {
  const coverElem = document.getElementById('song-cover');
  const titleElem = document.getElementById('song-title');
  if (coverElem && titleElem) {
    if (songCover && songCover !== '' && songTitle !== '') {
      coverElem.src = songCover;
      coverElem.classList.remove('transparent');
      titleElem.textContent = songTitle;
    } else {
      coverElem.src = '';
      coverElem.classList.add('transparent');
      titleElem.textContent = '';
    }
  }
}

if (window.electronAPI) {
  window.electronAPI.onLyricData((data) => {
    console.log("歌词窗口收到歌词数据，数量:", data.length);
    
  if (Array.isArray(data)) {
    lyrics = data;
  } else if (typeof data === 'object' && data !== null) {
    lyrics = data.lyrics || [];
    songCover = data.cover || '';
    songTitle = data.title || '';
  } else {
    lyrics = [];
  }

    renderLyrics();
    updateSongInfo();
  });

  window.electronAPI.onLyricTime((time) => {
    console.log("歌词窗口收到时间更新:", time);
    currentTime = time;
    highlightCurrentLyric();
  });
} else {
  console.error("electronAPI 未定义！");
}

window.addEventListener('load', () => {
  console.log("歌词窗口加载完成，请求歌词数据");
  if (window.electronAPI) {
    window.electronAPI.requestLyricData();
  }
});

window.addEventListener('resize', () => {
  highlightCurrentLyric();
});

const canvas = document.getElementById('visualizer');
if (canvas) {
  const ctx = canvas.getContext('2d');
  let vizData = new Array(64).fill(0);

  function drawVisualizer() {
    if (!canvas || !ctx) return;
    const width = canvas.width = window.innerWidth;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    const barWidth = width / vizData.length * 0.8;
    const gap = width / vizData.length * 0.2;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';

    for (let i = 0; i < vizData.length; i++) {
      const barHeight = (vizData[i] / 255) * height;
      const x = i * (barWidth + gap);
      const y = height - barHeight;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    requestAnimationFrame(drawVisualizer);
  }

  if (window.electronAPI) {
    window.electronAPI.onVisualizationData((data) => {
      vizData = data;
    });
  }
  drawVisualizer();
}