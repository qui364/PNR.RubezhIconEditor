// Приложение редактора библиотеки значков (Vue 3, без сборки).
(function (RIE) {
  'use strict';

  RIE.version = '0.0.1';

  var R = RIE.rlib;

  var SVG_TEMPLATE = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">\n' +
    '  <rect class="gk-background" width="500" height="500"/>\n</svg>';
  var CSS_TEMPLATE = 'ext.gk-background {\n  fill-opacity: 1;\n  fill: #4E4;\n}';
  var GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------- Компоненты ----------

  var XamlView = {
    props: { src: String },
    computed: {
      res: function () { return RIE.xaml.toSvg(this.src || ''); }
    },
    template: '<div class="art" v-if="res.svg" v-html="res.svg"></div>' +
      '<div class="art art-error" v-else :title="res.error">!</div>'
  };

  // Проигрывает кадры по кругу с их длительностями
  var FramePlayer = {
    components: { XamlView: XamlView },
    props: { frames: Array, playing: { type: Boolean, default: true } },
    data: function () { return { idx: 0, timer: null }; },
    computed: {
      current: function () {
        var f = this.frames;
        return f && f.length ? f[this.idx % f.length] : null;
      }
    },
    watch: {
      playing: function () { this.restart(); },
      'frames.length': function () { this.restart(); }
    },
    mounted: function () { this.restart(); },
    beforeUnmount: function () { clearTimeout(this.timer); },
    methods: {
      restart: function () {
        clearTimeout(this.timer);
        this.idx = 0;
        this.schedule();
      },
      schedule: function () {
        var self = this;
        if (!this.playing || !this.frames || this.frames.length < 2) return;
        var d = Math.max(50, this.current.duration || 0);
        this.timer = setTimeout(function () {
          self.idx = (self.idx + 1) % self.frames.length;
          self.schedule();
        }, d);
      }
    },
    template: '<xaml-view v-if="current" :src="current.image"></xaml-view><div v-else class="art art-empty">нет кадров</div>'
  };

  var SvgPreview = {
    props: { svg: String },
    computed: {
      url: function () { return RIE.svgweb.dataUrl(this.svg); }
    },
    template: '<img class="art" :src="url" alt="">'
  };

  // Миниатюра состояния: XAML-кадры, а если их нет — SVG для веба
  var StateArt = {
    components: { FramePlayer: FramePlayer, SvgPreview: SvgPreview },
    props: { device: Object, state: Object, playing: { type: Boolean, default: true } },
    computed: {
      web: function () {
        var s = this.state;
        return s && !s.frames.length && s.svgImage !== null ? RIE.svgweb.compose(this.device, s) : null;
      }
    },
    template: '<svg-preview v-if="web && web.svg" :svg="web.svg"></svg-preview>' +
      '<frame-player v-else :frames="state ? state.frames : []" :playing="playing"></frame-player>'
  };

  // ---------- Приложение ----------

  var app = Vue.createApp({
    components: { XamlView: XamlView, FramePlayer: FramePlayer, SvgPreview: SvgPreview, StateArt: StateArt },

    data: function () {
      return {
        version: RIE.version,
        lib: null,
        fileName: '',
        handle: null,
        bom: false,
        dirty: false,
        search: '',
        deviceKey: null,
        stateKey: null,
        frameIdx: 0,
        tab: 'xaml',
        theme: loadPref('theme', 'auto'),
        sizes: loadSizes(),   // ширины колонок и размер превью (разделители)
        view: 'devices',      // видимая панель на узком экране: devices | device | editor
        menuOpen: false,      // бургер-меню панели инструментов (узкий экран)
        playing: true,
        newStateClass: '',
        newStateCopy: false,
        status: '',
        statusErr: false,
        dragOver: false,
        dlg: null,   // открытое модальное окно: { title, text, ok, cancel, danger, resolve }
        canSaveInPlace: RIE.fileio.canSaveInPlace
      };
    },

    computed: {
      themeName: function () { return THEMES[this.theme] || THEMES.auto; },
      devices: function () {
        if (!this.lib) return [];
        var q = this.search.trim().toLowerCase();
        if (!q) return this.lib.devices;
        var self = this;
        return this.lib.devices.filter(function (d) {
          var drv = self.driver(d) || [];
          return [d.name, drv[0], drv[1]].join('\n').toLowerCase().indexOf(q) >= 0 ||
            d.uid.toLowerCase().indexOf(q) >= 0 || d.driverUid.toLowerCase().indexOf(q) >= 0;
        });
      },
      device: function () {
        var k = this.deviceKey;
        return this.lib && this.lib.devices.find(function (d) { return d.key === k; }) || null;
      },
      states: function () {
        if (!this.device) return [];
        return this.device.states.slice().sort(function (a, b) {
          return RIE.states.order(a.stateClass) - RIE.states.order(b.stateClass);
        });
      },
      state: function () {
        var k = this.stateKey;
        return this.device && this.device.states.find(function (s) { return s.key === k; }) || null;
      },
      frame: function () {
        return this.state && this.state.frames[this.frameIdx] || null;
      },
      frameRes: function () {
        return this.frame ? RIE.xaml.toSvg(this.frame.image) : null;
      },
      missingStates: function () {
        var have = {};
        (this.device ? this.device.states : []).forEach(function (s) { have[s.stateClass] = 1; });
        return RIE.states.list.filter(function (s) { return !have[s.code]; });
      },
      web: function () {
        return this.state && this.state.svgImage !== null ? RIE.svgweb.compose(this.device, this.state) : null;
      },
      driverText: function () {
        var drv = this.device && this.driver(this.device);
        return drv ? drv.filter(Boolean).join(' — ') : 'нет в справочнике драйверов';
      },
      driverUidValid: function () {
        return !this.device || GUID_RE.test(this.device.driverUid);
      },
      // Панель для узкого экрана; если выбранной нет (удалили) — ближайшая существующая
      shownView: function () {
        if (this.view === 'editor' && !this.state || this.view === 'device') return this.device ? 'device' : 'devices';
        return this.view;
      },
      layoutStyle: function () {
        return {
          '--w-devices': this.sizes.devices + 'px',
          '--w-device': this.sizes.device + 'px',
          '--stage': this.sizes.stage + 'px'
        };
      },
      title: function () {
        var app = 'PNR.RubezhIconEditor';
        if (!this.fileName) return app;
        return (this.dirty ? '● ' : '') + this.fileName + ' | ' + app;
      }
    },

    watch: {
      lib: {
        deep: true,
        handler: function (nv, ov) {
          if (nv !== ov) return;
          this.dirty = true;
          this.queueDraft();
        }
      },
      title: {
        immediate: true,
        handler: function (t) { document.title = t; }
      },
      theme: {
        immediate: true,
        handler: function (v) {
          document.documentElement.setAttribute('data-theme', v);
          savePref('theme', v);
        }
      },
      deviceKey: function () {
        var s = this.states.find(function (x) { return x.stateClass === 'No'; }) || this.states[0];
        this.stateKey = s ? s.key : null;
      },
      stateKey: function () {
        this.frameIdx = 0;
        this.tab = 'xaml';
      },
      missingStates: function (v) {
        if (!v.some(function (s) { return s.code === this.newStateClass; }, this)) {
          this.newStateClass = v.length ? v[0].code : '';
        }
      }
    },

    mounted: function () {
      var self = this;
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && self.menuOpen) { self.menuOpen = false; return; }
        if (!(e.ctrlKey || e.metaKey) || self.dlg) return;
        var k = e.key.toLowerCase();
        if (k === 's' || k === 'ы') { e.preventDefault(); e.shiftKey ? self.saveAs() : self.save(); }
        else if (k === 'o' || k === 'щ') { e.preventDefault(); self.open(); }
      });
      window.addEventListener('beforeunload', function (e) {
        if (self._resetting) return;
        self.flushDraft();
        if (self.dirty) { e.preventDefault(); e.returnValue = ''; }
      });
      window.addEventListener('pagehide', function () { if (!self._resetting) self.flushDraft(); });
      this.restoreDraft();
    },

    methods: {
      // Узкий экран: панели показываются по одной (см. @media в app.css)
      narrow: function () { return window.matchMedia(NARROW).matches; },
      pickDevice: function (d) {
        this.deviceKey = d.key;
        if (this.narrow()) this.view = 'device';
      },
      pickState: function (s) {
        this.stateKey = s.key;
        if (this.narrow()) this.view = 'editor';
      },

      // Перетаскивание разделителя: name — ключ в sizes, axis — 'x' или 'y'
      startResize: function (e, name, axis) {
        if (e.button) return;
        e.preventDefault();
        var self = this, el = e.currentTarget, lim = SIZE_LIMITS[name];
        var start = axis === 'x' ? e.clientX : e.clientY, from = this.sizes[name];
        el.setPointerCapture(e.pointerId);
        el.classList.add('active');
        function move(ev) {
          var v = from + (axis === 'x' ? ev.clientX : ev.clientY) - start;
          self.sizes[name] = Math.round(Math.max(lim[0], Math.min(lim[1], v)));
        }
        function up() {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          el.classList.remove('active');
          savePref('sizes', JSON.stringify(self.sizes));
        }
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      },
      // Двойной щелчок по разделителю — размер по умолчанию
      nextTheme: function () {
        var k = Object.keys(THEMES);
        this.theme = k[(k.indexOf(this.theme) + 1) % k.length];
      },
      resetSize: function (name) {
        this.sizes[name] = SIZE_DEFAULTS[name];
        savePref('sizes', JSON.stringify(this.sizes));
      },

      label: function (code) { return RIE.states.label(code); },
      // Драйвер по справочнику data/drivers.js: [обозначение, наименование] или null
      driver: function (d) { return RIE.drivers && RIE.drivers[d.driverUid.toLowerCase()] || null; },
      // Как в администраторе: Name варианта, иначе наименование драйвера
      deviceTitle: function (d) {
        var drv = this.driver(d);
        return d.name || drv && (drv[1] || drv[0]) || 'Неизвестный драйвер';
      },
      deviceSub: function (d) {
        var drv = this.driver(d);
        return drv ? drv[0] : this.short(d.driverUid);
      },
      // Миниатюра — XAML-рисунок (как в десктоп-клиенте): «Базовый рисунок», затем «Норма»,
      // затем любое состояние с кадрами. В заводской библиотеке у «No» обычно только SvgImage
      // с незалитым gk-background — без CSS состояния он чёрный, поэтому SVG — в последнюю очередь.
      thumbState: function (d) {
        function find(f) { return d.states.find(f); }
        return find(function (x) { return x.stateClass === 'No' && x.frames.length; }) ||
          find(function (x) { return x.stateClass === 'Norm' && x.frames.length; }) ||
          find(function (x) { return x.frames.length; }) ||
          find(function (x) { return x.stateClass === 'No'; }) || d.states[0] || null;
      },
      short: function (guid) { return guid ? guid.slice(0, 8) : '—'; },

      say: function (msg, err) {
        this.status = msg;
        this.statusErr = !!err;
      },

      // Модальное подтверждение вместо confirm(): возвращает Promise<boolean>.
      // Esc и «Отмена» — false, Enter (фокус на кнопке действия) — true.
      ask: function (o) {
        var self = this;
        if (this.dlg) this.answer(false);
        return new Promise(function (resolve) {
          self.dlg = {
            title: o.title || 'Подтверждение',
            text: o.text || '',
            ok: o.ok || 'OK',
            cancel: o.cancel || 'Отмена',
            danger: !!o.danger,
            resolve: resolve
          };
          self.$nextTick(function () {
            if (!self.$refs.dlg.open) self.$refs.dlg.showModal();
            self.$refs.dlgOk.focus();
          });
        });
      },

      answer: function (v) {
        var d = this.dlg;
        if (!d) return;
        this.dlg = null;
        if (this.$refs.dlg.open) this.$refs.dlg.close();
        d.resolve(v);
      },

      confirmDiscard: function () {
        if (!this.dirty) return Promise.resolve(true);
        return this.ask({
          title: 'Несохранённые изменения',
          text: 'В «' + this.fileName + '» есть несохранённые изменения. Продолжить без сохранения?',
          ok: 'Не сохранять', danger: true
        });
      },

      // ----- Файлы -----
      open: async function () {
        if (!await this.confirmDiscard()) return;
        try {
          var f = await RIE.fileio.open();
          if (f) this.load(f);
        } catch (e) {
          this.say('Не удалось открыть файл: ' + e.message, true);
        }
      },

      openDefault: async function () {
        var ok = this.dirty ? await this.confirmDiscard() : !this.lib || await this.ask({
          title: 'Заводская библиотека',
          text: 'Закрыть «' + this.fileName + '» и открыть заводскую библиотеку «Рубеж» 2.8.7?',
          ok: 'Открыть'
        });
        if (!ok) return;
        try {
          this.load(await RIE.fileio.openDefault());
        } catch (e) {
          this.say('Не удалось открыть заводскую библиотеку: ' + e.message, true);
        }
      },

      onDrop: async function (ev) {
        this.dragOver = false;
        var item = ev.dataTransfer.items && ev.dataTransfer.items[0];
        var file = ev.dataTransfer.files[0];
        if (!file) return;
        // Хэндл запрашиваем сразу: после await (модального окна) dataTransfer уже недоступен
        var handleP = item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(function () { return null; }) : null;
        if (!await this.confirmDiscard()) return;
        try {
          var handle = handleP ? await handleP : null;
          var f = await RIE.fileio.readFile(file);
          f.handle = handle && handle.kind === 'file' ? handle : null;
          this.load(f);
        } catch (e) {
          this.say('Не удалось открыть файл: ' + e.message, true);
        }
      },

      // fromDraft — восстановление из черновика; f.dirty — были ли в нём несохранённые правки
      load: function (f, fromDraft) {
        var lib;
        try {
          lib = R.parse(f.text);
        } catch (e) {
          this.say('Ошибка чтения «' + f.name + '»: ' + e.message, true);
          return;
        }
        this.lib = lib;
        this.fileName = f.name;
        this.handle = f.handle || null;
        this.bom = f.bom;
        this.search = '';
        this.deviceKey = lib.devices.length ? lib.devices[0].key : null;
        this.view = 'devices';
        var self = this;
        this.$nextTick(function () { self.dirty = !!(fromDraft && f.dirty); });
        if (!fromDraft) this.writeDraft(f.text, false);
        this.say((!fromDraft ? 'Открыт «' + f.name + '»'
          : f.dirty ? 'Восстановлен «' + f.name + '» с несохранёнными изменениями'
          : 'Открыт «' + f.name + '» из прошлого сеанса') + ': устройств ' + lib.devices.length);
        return true;
      },

      // ----- Черновик (IndexedDB, js/draft.js): переживает перезагрузку и сбой -----
      restoreDraft: async function () {
        var rec;
        try { rec = await RIE.draft.load(); } catch (e) { return; }
        if (!rec || this.lib) return;   // пока читали, пользователь уже открыл файл
        if (!this.load(rec, true)) RIE.draft.clear().catch(function () {});
      },

      queueDraft: function () {
        var self = this;
        clearTimeout(this._draftTimer);
        this._draftTimer = setTimeout(function () { self.flushDraft(); }, 1000);
      },

      flushDraft: function () {
        if (!this._draftTimer) return;
        clearTimeout(this._draftTimer);
        this._draftTimer = null;
        if (this.lib) this.writeDraft();
      },

      // text — готовый текст файла (иначе сериализуется текущая библиотека)
      writeDraft: function (text, dirty) {
        var self = this;
        clearTimeout(this._draftTimer);
        this._draftTimer = null;
        try {
          RIE.draft.save({
            name: this.fileName, text: text != null ? text : R.serialize(this.lib),
            bom: this.bom, handle: Vue.toRaw(this.handle), dirty: dirty != null ? dirty : this.dirty
          }).catch(function (e) { self.say('Не удалось сохранить черновик: ' + e.message, true); });
        } catch (e) { /* ошибку сериализации покажет «Сохранить» */ }
      },

      // Сброс локального хранилища: черновик в IndexedDB и настройки rie.* в localStorage
      resetStorage: async function () {
        if (!await this.ask({
          title: 'Сброс локальных данных',
          text: 'Удалить из браузера черновик открытого файла и настройки (тема, размеры панелей)? ' +
            (this.dirty ? 'Несохранённые изменения в «' + this.fileName + '» будут потеряны. ' : '') +
            'Файлы на диске не затрагиваются. Страница будет перезагружена.',
          ok: 'Сбросить', danger: true
        })) return;
        this._resetting = true;
        clearTimeout(this._draftTimer);
        this._draftTimer = null;
        try { await RIE.draft.clear(); } catch (e) { /* IndexedDB недоступна — черновика и нет */ }
        try {
          Object.keys(localStorage).forEach(function (k) { if (k.indexOf('rie.') === 0) localStorage.removeItem(k); });
        } catch (e) { /* localStorage недоступен */ }
        location.reload();
      },

      save: async function () {
        if (!this.lib) return;
        if (!this.handle) return this.saveAs();
        try {
          var text = R.serialize(this.lib);
          await RIE.fileio.writeHandle(this.handle, text, this.bom);
          this.dirty = false;
          this.writeDraft(text, false);
          this.say('Сохранено: ' + this.fileName);
        } catch (e) {
          this.say('Не удалось сохранить: ' + e.message, true);
        }
      },

      saveAs: async function () {
        if (!this.lib) return;
        try {
          var text = R.serialize(this.lib);
          var res = await RIE.fileio.saveAs(this.fileName || 'Библиотека значков.rlib', text, this.bom);
          if (!res) return;
          this.handle = res.handle;
          this.fileName = res.name;
          this.dirty = false;
          this.writeDraft(text, false);
          this.say(res.downloaded ? 'Файл скачан: ' + res.name + ' (браузер не поддерживает сохранение в исходный файл)' : 'Сохранено: ' + res.name);
        } catch (e) {
          this.say('Не удалось сохранить: ' + e.message, true);
        }
      },

      // ----- Устройства -----
      setName: function (v) {
        this.device.name = v === '' ? null : v;
      },

      duplicateDevice: function () {
        var d = this.device;
        var c = R.cloneDevice(d);
        if (c.name !== null) c.name = c.name + ' (копия)';
        this.lib.devices.splice(this.lib.devices.indexOf(d) + 1, 0, c);
        this.deviceKey = c.key;
        this.say('Создана копия устройства с новым UID');
      },

      deleteDevice: async function () {
        var d = this.device;
        if (!await this.ask({
          title: 'Удаление устройства',
          text: 'Удалить устройство «' + this.deviceTitle(d) + '» (' + d.uid + ') со всеми состояниями?',
          ok: 'Удалить', danger: true
        })) return;
        var list = this.lib.devices;
        var i = list.indexOf(d);
        list.splice(i, 1);
        this.deviceKey = list.length ? list[Math.min(i, list.length - 1)].key : null;
      },

      // ----- Состояния -----
      addState: function () {
        if (!this.newStateClass) return;
        var s;
        if (this.newStateCopy && this.state) {
          s = R.cloneState(this.state);
          s.stateClass = this.newStateClass;
        } else {
          s = R.newState(this.newStateClass);
          s.frames.push(R.newFrame(0, 500, R.EMPTY_CANVAS));
        }
        this.device.states.push(s);
        this.stateKey = s.key;
      },

      deleteState: async function () {
        var s = this.state;
        if (!await this.ask({
          title: 'Удаление состояния',
          text: 'Удалить состояние «' + this.label(s.stateClass) + '» со всеми кадрами?',
          ok: 'Удалить', danger: true
        })) return;
        var list = this.device.states;
        list.splice(list.indexOf(s), 1);
        this.stateKey = this.states.length ? this.states[0].key : null;
      },

      // ----- Кадры -----
      nextFrameId: function () {
        return this.state.frames.reduce(function (m, f) { return Math.max(m, f.id + 1); }, 0);
      },

      addFrame: function () {
        var f = R.newFrame(this.nextFrameId(), 500, R.EMPTY_CANVAS);
        this.state.frames.push(f);
        this.frameIdx = this.state.frames.length - 1;
      },

      duplicateFrame: function (i) {
        var c = R.cloneFrame(this.state.frames[i]);
        c.id = this.nextFrameId();
        this.state.frames.splice(i + 1, 0, c);
        this.frameIdx = i + 1;
      },

      deleteFrame: async function (i) {
        if (!await this.ask({ title: 'Удаление кадра', text: 'Удалить кадр ' + (i + 1) + '?', ok: 'Удалить', danger: true })) return;
        this.state.frames.splice(i, 1);
        this.frameIdx = Math.max(0, Math.min(this.frameIdx, this.state.frames.length - 1));
      },

      moveFrame: function (i, dir) {
        var list = this.state.frames;
        var j = i + dir;
        if (j < 0 || j >= list.length) return;
        var f = list.splice(i, 1)[0];
        list.splice(j, 0, f);
        this.frameIdx = j;
      },

      setDuration: function (f, v) {
        var n = parseInt(v, 10);
        if (n > 0) f.duration = n;
      },

      // ----- SVG для веба -----
      addSvg: function () {
        this.state.svgImage = this.state.stateClass === 'No' ? SVG_TEMPLATE : CSS_TEMPLATE;
      },

      deleteSvg: async function () {
        var s = this.state;
        if (await this.ask({
          title: 'Удаление SVG',
          text: 'Удалить SVG (рисунок для веб-клиента) у этого состояния?',
          ok: 'Удалить', danger: true
        })) s.svgImage = null;
      }
    }
  });

  // Тема UI: значение rie.theme → название; кнопка перебирает по кругу
  var THEMES = { auto: 'как в системе', light: 'светлая', dark: 'тёмная' };

  var NARROW = '(max-width: 760px)';   // то же значение — в @media в app.css
  var SIZE_DEFAULTS = { devices: 270, device: 290, stage: 320 };
  var SIZE_LIMITS = { devices: [160, 640], device: [200, 640], stage: [120, 900] };

  function loadSizes() {
    var r = {}, v;
    try { v = JSON.parse(loadPref('sizes', '{}')) || {}; } catch (e) { v = {}; }
    Object.keys(SIZE_DEFAULTS).forEach(function (k) {
      var n = +v[k], lim = SIZE_LIMITS[k];
      r[k] = n >= lim[0] && n <= lim[1] ? n : SIZE_DEFAULTS[k];
    });
    return r;
  }

  function loadPref(k, def) {
    try { return localStorage.getItem('rie.' + k) || def; } catch (e) { return def; }
  }

  function savePref(k, v) {
    try { localStorage.setItem('rie.' + k, v); } catch (e) { /* настройки необязательны */ }
  }

  // Корневой экземпляр доступен для отладки и автотестов
  RIE.app = app.mount('#app');
})(window.RIE);
