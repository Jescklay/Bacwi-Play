/**
 * Gerenciador de Armazenamento Local Persistente (IndexedDB)
 */
class PlayerStorage {
  constructor() {
    this.dbName = 'PlaybackProDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('mediaFiles')) {
          db.createObjectStore('mediaFiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('appSettings')) {
          db.createObjectStore('appSettings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      request.onerror = (e) => reject(e);
    });
  }

  async saveMedia(item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mediaFiles', 'readwrite');
      const store = tx.objectStore('mediaFiles');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async getAllMedia() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mediaFiles', 'readonly');
      const store = tx.objectStore('mediaFiles');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e);
    });
  }

  async deleteMedia(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mediaFiles', 'readwrite');
      const store = tx.objectStore('mediaFiles');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async clearAllMedia() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mediaFiles', 'readwrite');
      const store = tx.objectStore('mediaFiles');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async saveSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('appSettings', 'readwrite');
      const store = tx.objectStore('appSettings');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async getSetting(key) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('appSettings', 'readonly');
      const store = tx.objectStore('appSettings');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }
}

/**
 * Player Principal com Suporte a Estado e Persistência
 */
class PlaybackPlayer {
  constructor() {
    this.storage = new PlayerStorage();
    this.playlist = [];
    this.currentIndex = -1;
    this.rotation = 0;
    this.isMini = false;
    this.photoTimer = null;
    this.savedTime = 0;

    this.initDOM();
    this.bindEvents();
  }

  async start() {
    await this.storage.init();
    await this.loadSavedState();
    lucide.createIcons();
  }

  initDOM() {
    this.dom = {
      videoPlayer: document.getElementById('videoPlayer'),
      imageViewer: document.getElementById('imageViewer'),
      emptyState: document.getElementById('emptyState'),
      photoControls: document.getElementById('photoControls'),

      btnPlayPause: document.getElementById('btnPlayPause'),
      playIcon: document.getElementById('playIcon'),
      btnPrev: document.getElementById('btnPrev'),
      btnNext: document.getElementById('btnNext'),

      volumeSlider: document.getElementById('volumeSlider'),
      volPercentage: document.getElementById('volPercentage'),
      btnMute: document.getElementById('btnMute'),
      volIcon: document.getElementById('volIcon'),

      progressBarBg: document.getElementById('progressBarBg'),
      progressBarFill: document.getElementById('progressBarFill'),
      currentTime: document.getElementById('currentTime'),
      durationTime: document.getElementById('durationTime'),

      mediaInput: document.getElementById('mediaInput'),
      themeInput: document.getElementById('themeInput'),
      mediaList: document.getElementById('mediaList'),
      mediaCount: document.getElementById('mediaCount'),
      currentTitle: document.getElementById('currentTitle'),
      mediaTypeIcon: document.getElementById('mediaTypeIcon'),
      appBg: document.getElementById('appBg'),

      btnMiniPlayer: document.getElementById('btnMiniPlayer'),
      miniIcon: document.getElementById('miniIcon'),
      btnFullscreen: document.getElementById('btnFullscreen'),
      playerWrapper: document.getElementById('playerWrapper'),
      displayArea: document.getElementById('displayArea'),
      btnClearPlaylist: document.getElementById('btnClearPlaylist'),

      btnRotateCw: document.getElementById('btnRotateCw'),
      btnRotateCcw: document.getElementById('btnRotateCcw'),
      btnResetRotate: document.getElementById('btnResetRotate')
    };
  }

  bindEvents() {
    this.dom.mediaInput.addEventListener('change', (e) => this.handleMediaImport(e));
    this.dom.themeInput.addEventListener('change', (e) => this.handleThemeChange(e));

    this.dom.btnPlayPause.addEventListener('click', () => this.togglePlay());
    this.dom.btnNext.addEventListener('click', () => this.playNext());
    this.dom.btnPrev.addEventListener('click', () => this.playPrev());

    this.dom.videoPlayer.addEventListener('ended', () => this.playNext());
    this.dom.videoPlayer.addEventListener('timeupdate', () => {
      this.updateProgress();
      this.saveCurrentPlaybackState();
    });
    this.dom.progressBarBg.addEventListener('click', (e) => this.seekVideo(e));

    this.dom.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.setVolume(val);
      localStorage.setItem('playback_volume', val);
    });

    this.dom.btnMute.addEventListener('click', () => this.toggleMute());

    this.dom.btnRotateCw.addEventListener('click', () => this.rotatePhoto(90));
    this.dom.btnRotateCcw.addEventListener('click', () => this.rotatePhoto(-90));
    this.dom.btnResetRotate.addEventListener('click', () => this.resetPhotoRotation());

    this.dom.btnMiniPlayer.addEventListener('click', () => this.toggleMiniPlayer());
    this.dom.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.dom.btnClearPlaylist.addEventListener('click', () => this.clearPlaylist());
  }

  async loadSavedState() {
    // Restaurar Tema
    const savedTheme = await this.storage.getSetting('appTheme');
    if (savedTheme) {
      this.dom.appBg.style.backgroundImage = `url('${savedTheme}')`;
    }

    // Restaurar Volume
    const savedVol = localStorage.getItem('playback_volume');
    if (savedVol !== null) {
      const vol = parseFloat(savedVol);
      this.dom.volumeSlider.value = vol;
      this.setVolume(vol);
    }

    // Restaurar Mídias do IndexedDB
    const items = await this.storage.getAllMedia();
    if (items && items.length > 0) {
      this.playlist = items.map(item => ({
        ...item,
        url: URL.createObjectURL(item.file)
      }));

      this.renderPlaylist();

      // Restaurar última faixa tocada
      const lastIndex = parseInt(localStorage.getItem('playback_last_index') || '0', 10);
      const validIndex = (lastIndex >= 0 && lastIndex < this.playlist.length) ? lastIndex : 0;
      this.savedTime = parseFloat(localStorage.getItem('playback_last_time') || '0');

      this.loadMedia(validIndex, false);
    } else {
      this.dom.currentTitle.textContent = 'Nenhuma mídia selecionada';
    }
  }

  async handleMediaImport(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (isVideo || isImage) {
        const item = {
          id: 'item_' + Date.now() + Math.random().toString(36).substring(2, 6),
          name: file.name,
          type: isVideo ? 'video' : 'image',
          file: file
        };

        await this.storage.saveMedia(item);
        this.playlist.push({
          ...item,
          url: URL.createObjectURL(file)
        });
      }
    }

    this.renderPlaylist();

    if (this.currentIndex === -1 && this.playlist.length > 0) {
      this.loadMedia(0, true);
    }
    this.dom.mediaInput.value = '';
  }

  async handleThemeChange(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        this.dom.appBg.style.backgroundImage = `url('${dataUrl}')`;
        await this.storage.saveSetting('appTheme', dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  renderPlaylist() {
    this.dom.mediaList.innerHTML = '';
    this.dom.mediaCount.textContent = this.playlist.length;

    this.playlist.forEach((item, index) => {
      const isActive = index === this.currentIndex;
      const card = document.createElement('div');
      
      card.className = `flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
        isActive 
          ? 'bg-blue-600/20 border-blue-500/50 text-white' 
          : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 text-slate-300'
      }`;

      card.innerHTML = `
        <div class="flex items-center gap-3 truncate mr-2">
          <i data-lucide="${item.type === 'video' ? 'video' : 'image'}" class="w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'} flex-shrink-0"></i>
          <span class="text-xs font-medium truncate">${item.name}</span>
        </div>
        <button type="button" class="btn-remove p-1 text-slate-500 hover:text-red-400 rounded-lg transition" title="Remover">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      `;

      card.querySelector('.btn-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeMedia(index);
      });

      card.addEventListener('click', () => this.loadMedia(index, true));
      this.dom.mediaList.appendChild(card);
    });

    lucide.createIcons();
  }

  loadMedia(index, autoPlay = true) {
    if (index < 0 || index >= this.playlist.length) return;

    if (this.photoTimer) {
      clearTimeout(this.photoTimer);
      this.photoTimer = null;
    }

    this.currentIndex = index;
    localStorage.setItem('playback_last_index', index);

    const item = this.playlist[this.currentIndex];

    this.dom.emptyState.classList.add('hidden');
    this.dom.currentTitle.textContent = item.name;
    this.resetPhotoRotation();

    if (item.type === 'video') {
      this.dom.imageViewer.classList.add('hidden');
      this.dom.photoControls.classList.add('hidden');
      this.dom.photoControls.classList.remove('flex');
      this.dom.videoPlayer.classList.remove('hidden');

      this.dom.videoPlayer.src = item.url;
      this.dom.mediaTypeIcon.setAttribute('data-lucide', 'film');

      if (this.savedTime > 0) {
        this.dom.videoPlayer.currentTime = this.savedTime;
        this.savedTime = 0;
      }

      if (autoPlay) {
        this.dom.videoPlayer.play().then(() => {
          this.setPlayIcon(true);
        }).catch(() => {
          this.setPlayIcon(false);
        });
      } else {
        this.setPlayIcon(false);
      }
    } else {
      this.dom.videoPlayer.pause();
      this.dom.videoPlayer.classList.add('hidden');
      this.dom.imageViewer.classList.remove('hidden');
      this.dom.photoControls.classList.remove('hidden');
      this.dom.photoControls.classList.add('flex');

      this.dom.imageViewer.src = item.url;
      this.dom.mediaTypeIcon.setAttribute('data-lucide', 'image');
      this.setPlayIcon(false);

      if (autoPlay) {
        this.photoTimer = setTimeout(() => this.playNext(), 6000);
      }
    }

    this.renderPlaylist();
    lucide.createIcons();
  }

  saveCurrentPlaybackState() {
    if (this.dom.videoPlayer && !this.dom.videoPlayer.paused) {
      localStorage.setItem('playback_last_time', this.dom.videoPlayer.currentTime);
    }
  }

  togglePlay() {
    if (this.currentIndex === -1 && this.playlist.length > 0) {
      this.loadMedia(0, true);
      return;
    }

    const item = this.playlist[this.currentIndex];
    if (!item) return;

    if (item.type === 'video') {
      if (this.dom.videoPlayer.paused) {
        this.dom.videoPlayer.play();
        this.setPlayIcon(true);
      } else {
        this.dom.videoPlayer.pause();
        this.setPlayIcon(false);
      }
    } else {
      this.playNext();
    }
  }

  setPlayIcon(isPlaying) {
    this.dom.playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide.createIcons();
  }

  playNext() {
    if (!this.playlist.length) return;
    let next = this.currentIndex + 1;
    if (next >= this.playlist.length) next = 0;
    this.loadMedia(next, true);
  }

  playPrev() {
    if (!this.playlist.length) return;
    let prev = this.currentIndex - 1;
    if (prev < 0) prev = this.playlist.length - 1;
    this.loadMedia(prev, true);
  }

  setVolume(val) {
    this.dom.videoPlayer.volume = val;
    this.dom.volPercentage.textContent = `${Math.round(val * 100)}%`;
    
    let iconName = 'volume-2';
    if (val === 0) iconName = 'volume-x';
    else if (val < 0.5) iconName = 'volume-1';

    this.dom.volIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();
  }

  toggleMute() {
    if (this.dom.videoPlayer.volume > 0) {
      this.dom.videoPlayer.dataset.lastVol = this.dom.videoPlayer.volume;
      this.setVolume(0);
      this.dom.volumeSlider.value = 0;
    } else {
      const last = parseFloat(this.dom.videoPlayer.dataset.lastVol || 1);
      this.setVolume(last);
      this.dom.volumeSlider.value = last;
    }
  }

  updateProgress() {
    if (isNaN(this.dom.videoPlayer.duration)) return;
    const pct = (this.dom.videoPlayer.currentTime / this.dom.videoPlayer.duration) * 100;
    this.dom.progressBarFill.style.width = `${pct}%`;

    this.dom.currentTime.textContent = this.formatTime(this.dom.videoPlayer.currentTime);
    this.dom.durationTime.textContent = this.formatTime(this.dom.videoPlayer.duration);
  }

  seekVideo(e) {
    if (!this.dom.videoPlayer.duration) return;
    const rect = this.dom.progressBarBg.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    this.dom.videoPlayer.currentTime = pos * this.dom.videoPlayer.duration;
  }

  rotatePhoto(deg) {
    this.rotation = (this.rotation + deg) % 360;
    this.dom.imageViewer.style.transform = `rotate(${this.rotation}deg)`;
  }

  resetPhotoRotation() {
    this.rotation = 0;
    this.dom.imageViewer.style.transform = `rotate(0deg)`;
  }

  toggleMiniPlayer() {
    this.isMini = !this.isMini;
    if (this.isMini) {
      this.dom.playerWrapper.classList.add('is-mini');
      this.dom.miniIcon.setAttribute('data-lucide', 'maximize-2');
    } else {
      this.dom.playerWrapper.classList.remove('is-mini');
      this.dom.miniIcon.setAttribute('data-lucide', 'minimize-2');
    }
    lucide.createIcons();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.dom.displayArea.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  async removeMedia(index) {
    const item = this.playlist[index];
    if (item) {
      if (item.url) URL.revokeObjectURL(item.url);
      await this.storage.deleteMedia(item.id);
    }

    this.playlist.splice(index, 1);

    if (this.currentIndex === index) {
      if (this.playlist.length > 0) {
        this.loadMedia(Math.min(index, this.playlist.length - 1), true);
      } else {
        this.currentIndex = -1;
        this.dom.videoPlayer.src = '';
        this.dom.imageViewer.src = '';
        this.dom.emptyState.classList.remove('hidden');
        this.dom.currentTitle.textContent = 'Nenhuma mídia selecionada';
        localStorage.removeItem('playback_last_index');
        localStorage.removeItem('playback_last_time');
      }
    } else if (this.currentIndex > index) {
      this.currentIndex--;
      localStorage.setItem('playback_last_index', this.currentIndex);
    }
    this.renderPlaylist();
  }

  async clearPlaylist() {
    this.playlist.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    await this.storage.clearAllMedia();
    this.playlist = [];
    this.currentIndex = -1;
    this.dom.videoPlayer.src = '';
    this.dom.imageViewer.src = '';
    this.dom.emptyState.classList.remove('hidden');
    this.dom.currentTitle.textContent = 'Nenhuma mídia selecionada';
    localStorage.removeItem('playback_last_index');
    localStorage.removeItem('playback_last_time');
    this.renderPlaylist();
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

// Inicializar aplicativo
document.addEventListener('DOMContentLoaded', () => {
  window.appPlayer = new PlaybackPlayer();
  window.appPlayer.start();
});