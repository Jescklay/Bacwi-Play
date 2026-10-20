/**
 * JescklayPlay - Armazenamento Persistente IndexedDB
 */
class PlayerStorage {
  constructor() {
    this.dbName = 'JescklayPlayDB';
    this.dbVersion = 2;
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
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
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

  async saveFolder(folder) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      const request = store.put(folder);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async getAllFolders() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e);
    });
  }

  async deleteFolder(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      const request = store.delete(id);
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
 * JescklayPlay Player Engine
 */
class PlaybackPlayer {
  constructor() {
    this.storage = new PlayerStorage();
    this.playlist = [];
    this.folders = [];
    this.currentFolderId = null;
    this.currentIndex = -1;
    this.rotation = 0;
    this.isMini = false;
    this.photoTimer = null;
    this.savedTime = 0;
    this.animId = null;

    this.initDOM();
    this.bindEvents();
    this.initDraggableMiniPlayer();
    this.initAudioVisualizer();
  }

  async start() {
    await this.storage.init();
    await this.loadSavedState();
    lucide.createIcons();
  }

  initDOM() {
    this.dom = {
      appBody: document.getElementById('appBody'),
      videoPlayer: document.getElementById('videoPlayer'),
      imageViewer: document.getElementById('imageViewer'),
      audioVisualizer: document.getElementById('audioVisualizer'),
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

      themeInput: document.getElementById('themeInput'),
      metalThemeSelect: document.getElementById('metalThemeSelect'),
      mediaList: document.getElementById('mediaList'),
      currentTitle: document.getElementById('currentTitle'),
      mediaTypeIcon: document.getElementById('mediaTypeIcon'),
      appBg: document.getElementById('appBg'),

      btnMiniPlayer: document.getElementById('btnMiniPlayer'),
      miniIcon: document.getElementById('miniIcon'),
      btnFullscreen: document.getElementById('btnFullscreen'),
      playerWrapper: document.getElementById('playerWrapper'),
      displayArea: document.getElementById('displayArea'),
      btnClearPlaylist: document.getElementById('btnClearPlaylist'),
      folderNav: document.getElementById('folderNav'),
      folderActionBar: document.getElementById('folderActionBar'),

      btnRotateCw: document.getElementById('btnRotateCw'),
      btnRotateCcw: document.getElementById('btnRotateCcw'),
      btnResetRotate: document.getElementById('btnResetRotate')
    };
  }

  bindEvents() {
    this.dom.themeInput.addEventListener('change', (e) => this.handleThemeChange(e));
    this.dom.metalThemeSelect.addEventListener('change', (e) => this.handleMetalThemeChange(e));

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
    this.dom.btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    const handleDisplayClick = (e) => {
      if (e.target.closest('#photoControls')) return;
      this.toggleFullscreen();
    };

    this.dom.displayArea.addEventListener('click', handleDisplayClick);

    this.dom.btnClearPlaylist.addEventListener('click', () => this.clearPlaylist());
  }

  toggleFullscreen() {
    const area = this.dom.displayArea;
    const isFull = area.classList.contains('mobile-fullscreen') || 
                   document.fullscreenElement || 
                   document.webkitFullscreenElement;

    if (!isFull) {
      if (area.requestFullscreen) {
        area.requestFullscreen().catch(() => this.enableMobileCssFullscreen());
      } else if (area.webkitRequestFullscreen) {
        area.webkitRequestFullscreen();
      } else {
        this.enableMobileCssFullscreen();
      }
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
      }
      this.disableMobileCssFullscreen();
    }
  }

  enableMobileCssFullscreen() {
    this.dom.displayArea.classList.add('mobile-fullscreen');
  }

  disableMobileCssFullscreen() {
    this.dom.displayArea.classList.remove('mobile-fullscreen');
  }

  initAudioVisualizer() {
    this.canvasCtx = this.dom.audioVisualizer.getContext('2d');
  }

  startAudioWaves() {
    const canvas = this.dom.audioVisualizer;
    const ctx = this.canvasCtx;
    canvas.classList.remove('hidden');

    const render = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const time = Date.now() * 0.003;
      const isPlaying = !this.dom.videoPlayer.paused;
      const amplitude = isPlaying ? canvas.height * 0.25 : canvas.height * 0.05;

      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.lineWidth = 3 - i;
        ctx.strokeStyle = i === 0 ? 'rgba(96, 165, 250, 0.8)' : (i === 1 ? 'rgba(168, 85, 247, 0.6)' : 'rgba(52, 211, 153, 0.5)');

        for (let x = 0; x < canvas.width; x += 5) {
          const y = canvas.height / 2 + Math.sin(x * 0.01 + time + i) * amplitude * Math.cos(x * 0.005 + time);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      this.animId = requestAnimationFrame(render);
    };

    if (this.animId) cancelAnimationFrame(this.animId);
    render();
  }

  stopAudioWaves() {
    this.dom.audioVisualizer.classList.add('hidden');
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  initDraggableMiniPlayer() {
    const wrapper = this.dom.playerWrapper;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    const startDrag = (e) => {
      if (!this.isMini) return;
      if (e.target.closest('button')) return;

      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const rect = wrapper.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.left = `${initialX}px`;
      wrapper.style.top = `${initialY}px`;
    };

    const doDrag = (e) => {
      if (!isDragging || !this.isMini) return;
      e.preventDefault();

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const dx = clientX - startX;
      const dy = clientY - startY;

      wrapper.style.left = `${initialX + dx}px`;
      wrapper.style.top = `${initialY + dy}px`;
    };

    const stopDrag = () => {
      isDragging = false;
    };

    wrapper.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);

    wrapper.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);
  }

  async loadSavedState() {
    const savedTheme = await this.storage.getSetting('appTheme') || 'titanium';
    if (['titanium', 'copper', 'gold', 'neonblue', 'emerald', 'purple', 'carbon'].includes(savedTheme)) {
      this.applyMetalTheme(savedTheme, false);
    } else {
      this.dom.appBg.style.backgroundImage = `url('${savedTheme}')`;
    }

    const savedVol = localStorage.getItem('playback_volume');
    if (savedVol !== null) {
      const vol = parseFloat(savedVol);
      this.dom.volumeSlider.value = vol;
      this.setVolume(vol);
    }

    this.folders = await this.storage.getAllFolders();

    const items = await this.storage.getAllMedia();
    if (items && items.length > 0) {
      this.playlist = items.map(item => ({
        ...item,
        url: URL.createObjectURL(item.file)
      }));

      const lastIndex = parseInt(localStorage.getItem('playback_last_index') || '0', 10);
      const validIndex = (lastIndex >= 0 && lastIndex < this.playlist.length) ? lastIndex : 0;
      this.savedTime = parseFloat(localStorage.getItem('playback_last_time') || '0');

      this.loadMedia(validIndex, false);
    } else {
      this.dom.currentTitle.textContent = 'Nenhuma mídia carregada';
    }

    this.renderFolderExplorer();
  }

  async handleMetalThemeChange(e) {
    const themeKey = e.target.value;
    if (!themeKey) return;
    this.applyMetalTheme(themeKey, true);
  }

  applyMetalTheme(themeKey, save = true) {
    this.dom.metalThemeSelect.value = themeKey;
    this.dom.appBody.className = `h-full text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white relative overflow-x-hidden theme-${themeKey}`;

    const bgElement = this.dom.appBg;
    const themes = {
      titanium: 'linear-gradient(135deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
      copper: 'linear-gradient(135deg, #ea580c 0%, #9a3412 50%, #431407 100%)',
      gold: 'linear-gradient(135deg, #f59e0b 0%, #b45309 50%, #451a03 100%)',
      neonblue: 'linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0c4a6e 100%)',
      emerald: 'linear-gradient(135deg, #10b981 0%, #047857 50%, #064e3b 100%)',
      purple: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 50%, #3b0764 100%)',
      carbon: 'radial-gradient(circle, #3f3f46 0%, #18181b 50%, #09090b 100%)'
    };

    bgElement.style.backgroundImage = themes[themeKey] || themes.titanium;

    if (save) {
      this.storage.saveSetting('appTheme', themeKey);
    }
  }

  async createNewFolder() {
    const name = prompt('Digite o nome do novo repertório / pasta:', 'Repertório Exemplo');
    if (!name || !name.trim()) return;

    const uniqueId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const folder = { id: uniqueId, name: name.trim() };

    await this.storage.saveFolder(folder);
    this.folders.push(folder);
    this.currentFolderId = folder.id;
    this.renderFolderExplorer();
  }

  async renameFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const newName = prompt('Digite o novo nome para o repertório:', folder.name);
    if (!newName || !newName.trim()) return;

    folder.name = newName.trim();
    await this.storage.saveFolder(folder);
    this.renderFolderExplorer();
  }

  async deleteFolder(folderId) {
    if (!confirm('Excluir este repertório? As mídias voltarão para o diretório raiz.')) return;

    await this.storage.deleteFolder(folderId);
    this.folders = this.folders.filter(f => f.id !== folderId);

    for (const item of this.playlist) {
      if (item.folderId === folderId) {
        item.folderId = null;
        await this.storage.saveMedia({ ...item, url: undefined });
      }
    }

    this.currentFolderId = null;
    this.renderFolderExplorer();
  }

  renderFolderExplorer() {
    if (this.currentFolderId === null) {
      this.dom.folderNav.innerHTML = `
        <i data-lucide="folder" class="w-5 h-5 theme-accent-text"></i>
        <span>Todas as Mídias e Repertórios</span>
      `;

      this.dom.folderActionBar.innerHTML = `
        <span class="text-slate-300">Total de Pastas: <strong class="text-white">${this.folders.length}</strong></span>
        <button id="btnActionNewFolder" type="button" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1 transition shadow-md shadow-emerald-600/20">
          <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
          <span>Criar Nova Pasta</span>
        </button>
      `;

      document.getElementById('btnActionNewFolder').addEventListener('click', () => this.createNewFolder());
    } else {
      const activeFolder = this.folders.find(f => f.id === this.currentFolderId);
      const folderName = activeFolder ? activeFolder.name : 'Pasta';

      this.dom.folderNav.innerHTML = `
        <button id="btnBackToRoot" class="flex items-center gap-1 text-slate-300 hover:text-white transition">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
          <span>Mídias</span>
        </button>
        <span class="text-slate-500">/</span>
        <span class="theme-accent-text flex items-center gap-1">
          <i data-lucide="folder-open" class="w-4 h-4"></i>
          ${folderName}
        </span>
      `;

      this.dom.folderActionBar.innerHTML = `
        <div class="flex items-center gap-2">
          <button id="btnRenameCurrentFolder" class="p-1.5 theme-button text-slate-200 rounded-lg transition" title="Renomear Pasta">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button id="btnDeleteCurrentFolder" class="p-1.5 theme-button hover:bg-red-500 text-slate-200 rounded-lg transition" title="Excluir Pasta">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <label for="mediaInputFolder" class="px-3 py-1.5 theme-btn-accent text-white rounded-lg font-semibold cursor-pointer flex items-center gap-1 shadow-md transition">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Adicionar Nesta Pasta</span>
        </label>
        <input type="file" id="mediaInputFolder" accept="video/*,audio/*,image/*" multiple class="hidden">
      `;

      document.getElementById('btnBackToRoot').addEventListener('click', () => {
        this.currentFolderId = null;
        this.renderFolderExplorer();
      });

      document.getElementById('btnRenameCurrentFolder').addEventListener('click', () => {
        this.renameFolder(this.currentFolderId);
      });

      document.getElementById('btnDeleteCurrentFolder').addEventListener('click', () => {
        this.deleteFolder(this.currentFolderId);
      });

      document.getElementById('mediaInputFolder').addEventListener('change', (e) => {
        this.handleMediaImport(e);
      });
    }

    this.dom.mediaList.innerHTML = '';

    if (this.currentFolderId === null) {
      this.folders.forEach(folder => {
        const count = this.playlist.filter(i => i.folderId === folder.id).length;
        const folderCard = document.createElement('div');
        folderCard.className = 'flex items-center justify-between p-3 media-card rounded-xl cursor-pointer transition group shadow-md';
        
        folderCard.innerHTML = `
          <div class="flex items-center gap-3 truncate">
            <div class="p-2 theme-icon-bg theme-accent-text rounded-lg transition">
              <i data-lucide="folder" class="w-5 h-5"></i>
            </div>
            <div class="truncate">
              <h3 class="text-xs font-bold text-white truncate">${folder.name}</h3>
              <p class="text-[10px] text-slate-300">${count} itens salvos</p>
            </div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover:text-white transition"></i>
        `;

        folderCard.addEventListener('click', () => {
          this.currentFolderId = folder.id;
          this.renderFolderExplorer();
        });

        this.dom.mediaList.appendChild(folderCard);
      });
    }

    const filteredMedia = this.playlist.filter(i => i.folderId === this.currentFolderId);

    filteredMedia.forEach((item) => {
      const originalIndex = this.playlist.findIndex(p => p.id === item.id);
      const isActive = originalIndex === this.currentIndex;
      const card = document.createElement('div');
      
      let iconName = 'music';
      if (item.type === 'video') iconName = 'video';
      if (item.type === 'image') iconName = 'image';

      card.className = `flex items-center justify-between p-3 rounded-xl transition cursor-pointer ${
        isActive 
          ? 'media-card-active shadow-lg' 
          : 'media-card text-slate-200'
      }`;

      card.innerHTML = `
        <div class="flex items-center gap-3 truncate mr-2">
          <i data-lucide="${iconName}" class="w-4 h-4 ${isActive ? 'theme-accent-text' : 'text-slate-300'} flex-shrink-0"></i>
          <span class="text-xs font-medium truncate">${item.name}</span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" class="btn-move p-1 text-slate-400 hover:text-white rounded-lg transition" title="Mover para outra Pasta">
            <i data-lucide="folder-input" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" class="btn-remove p-1 text-slate-400 hover:text-red-400 rounded-lg transition" title="Remover">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;

      card.querySelector('.btn-move').addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveMediaFolder(originalIndex);
      });

      card.querySelector('.btn-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeMedia(originalIndex);
      });

      card.addEventListener('click', () => {
        this.resetPlaybackTime();
        this.loadMedia(originalIndex, true);
      });
      this.dom.mediaList.appendChild(card);
    });

    lucide.createIcons();
  }

  async handleMediaImport(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const isImage = file.type.startsWith('image/');

      if (isVideo || isAudio || isImage) {
        const item = {
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
          name: file.name,
          type: isVideo ? 'video' : (isAudio ? 'audio' : 'image'),
          folderId: this.currentFolderId,
          file: file
        };

        await this.storage.saveMedia(item);
        this.playlist.push({
          ...item,
          url: URL.createObjectURL(file)
        });
      }
    }

    this.renderFolderExplorer();

    if (this.currentIndex === -1 && this.playlist.length > 0) {
      this.loadMedia(0, true);
    }
    e.target.value = '';
  }

  async handleThemeChange(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        this.dom.metalThemeSelect.value = '';
        this.dom.appBg.style.backgroundImage = `url('${dataUrl}')`;
        await this.storage.saveSetting('appTheme', dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  async moveMediaFolder(index) {
    const item = this.playlist[index];
    if (!item) return;

    let folderOptions = '0: Raiz (Sem Pasta)\n';
    this.folders.forEach((f, idx) => {
      folderOptions += `${idx + 1}: ${f.name}\n`;
    });

    const choice = prompt(`Mover "${item.name}" para onde?\n\n${folderOptions}`);
    if (choice === null) return;

    const num = parseInt(choice, 10);
    if (isNaN(num)) return;

    if (num === 0) {
      item.folderId = null;
    } else if (num > 0 && num <= this.folders.length) {
      item.folderId = this.folders[num - 1].id;
    } else {
      return;
    }

    await this.storage.saveMedia({ ...item, url: undefined });
    this.renderFolderExplorer();
  }

  resetPlaybackTime() {
    this.savedTime = 0;
    if (this.dom.videoPlayer) {
      this.dom.videoPlayer.currentTime = 0;
    }
    localStorage.setItem('playback_last_time', '0');
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

    if (item.type === 'video' || item.type === 'audio') {
      this.dom.imageViewer.classList.add('hidden');
      this.dom.photoControls.classList.add('hidden');
      this.dom.photoControls.classList.remove('flex');

      if (item.type === 'video') {
        this.dom.videoPlayer.classList.remove('hidden');
        this.dom.mediaTypeIcon.setAttribute('data-lucide', 'film');
        this.stopAudioWaves();
      } else {
        this.dom.videoPlayer.classList.add('hidden');
        this.dom.mediaTypeIcon.setAttribute('data-lucide', 'music');
        this.startAudioWaves();
      }

      this.dom.videoPlayer.src = item.url;

      if (this.savedTime > 0) {
        this.dom.videoPlayer.currentTime = this.savedTime;
        this.savedTime = 0;
      } else {
        this.dom.videoPlayer.currentTime = 0;
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
      this.stopAudioWaves();
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

    this.renderFolderExplorer();
    lucide.createIcons();
  }

  saveCurrentPlaybackState() {
    if (this.dom.videoPlayer && !this.dom.videoPlayer.paused) {
      localStorage.setItem('playback_last_time', this.dom.videoPlayer.currentTime);
    }
  }

  togglePlay() {
    if (this.currentIndex === -1 && this.playlist.length > 0) {
      this.resetPlaybackTime();
      this.loadMedia(0, true);
      return;
    }

    const item = this.playlist[this.currentIndex];
    if (!item) return;

    if (item.type === 'video' || item.type === 'audio') {
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
    const filtered = this.playlist.filter(i => i.folderId === this.currentFolderId);
    const listToPlay = filtered.length ? filtered : this.playlist;

    const currentSubIndex = listToPlay.findIndex(p => p.id === this.playlist[this.currentIndex]?.id);
    let nextSubIndex = currentSubIndex + 1;
    if (nextSubIndex >= listToPlay.length) nextSubIndex = 0;

    const nextItem = listToPlay[nextSubIndex];
    const originalIndex = this.playlist.findIndex(p => p.id === nextItem.id);

    this.resetPlaybackTime();
    this.loadMedia(originalIndex, true);
  }

  playPrev() {
    const filtered = this.playlist.filter(i => i.folderId === this.currentFolderId);
    const listToPlay = filtered.length ? filtered : this.playlist;

    const currentSubIndex = listToPlay.findIndex(p => p.id === this.playlist[this.currentIndex]?.id);
    let prevSubIndex = currentSubIndex - 1;
    if (prevSubIndex < 0) prevSubIndex = listToPlay.length - 1;

    const prevItem = listToPlay[prevSubIndex];
    const originalIndex = this.playlist.findIndex(p => p.id === prevItem.id);

    this.resetPlaybackTime();
    this.loadMedia(originalIndex, true);
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
    const wrapper = this.dom.playerWrapper;

    if (this.isMini) {
      wrapper.classList.add('is-mini');
      this.dom.miniIcon.setAttribute('data-lucide', 'maximize-2');
      wrapper.style.left = `${window.innerWidth - 300}px`;
      wrapper.style.top = `${window.innerHeight - 240}px`;
    } else {
      wrapper.classList.remove('is-mini');
      wrapper.style.left = '';
      wrapper.style.top = '';
      this.dom.miniIcon.setAttribute('data-lucide', 'minimize-2');
    }
    lucide.createIcons();
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
        this.resetPlaybackTime();
        this.loadMedia(Math.min(index, this.playlist.length - 1), true);
      } else {
        this.currentIndex = -1;
        this.dom.videoPlayer.src = '';
        this.dom.imageViewer.src = '';
        this.stopAudioWaves();
        this.dom.emptyState.classList.remove('hidden');
        this.dom.currentTitle.textContent = 'Nenhuma mídia carregada';
        localStorage.removeItem('playback_last_index');
        localStorage.removeItem('playback_last_time');
      }
    } else if (this.currentIndex > index) {
      this.currentIndex--;
      localStorage.setItem('playback_last_index', this.currentIndex);
    }
    this.renderFolderExplorer();
  }

  async clearPlaylist() {
    if (!confirm('Deseja realmente apagar todas as mídias e repertórios salvos?')) return;

    this.playlist.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    await this.storage.clearAllMedia();
    this.playlist = [];
    this.currentIndex = -1;
    this.dom.videoPlayer.src = '';
    this.dom.imageViewer.src = '';
    this.stopAudioWaves();
    this.dom.emptyState.classList.remove('hidden');
    this.dom.currentTitle.textContent = 'Nenhuma mídia carregada';
    localStorage.removeItem('playback_last_index');
    localStorage.removeItem('playback_last_time');
    this.renderFolderExplorer();
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', () => {
  window.appPlayer = new PlaybackPlayer();
  window.appPlayer.start();
});