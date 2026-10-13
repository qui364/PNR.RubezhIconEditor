// Приложение редактора библиотеки значков (Vue 3, без сборки).
(function (RIE) {
  'use strict';

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
        bg: loadPref('bg', 'dark'),
        playing: true,
        newStateClass: '',
        newStateCopy: false,
        status: '',
        statusErr: false,
        dragOver: false,
        canSaveInPlace: RIE.fileio.canSaveInPlace
      };
    },

    computed: {
      devices: function () {
        if (!this.lib) return [];
        var q = this.search.trim().toLowerCase();
        if (!q) return this.lib.devices;
        return this.lib.devices.filter(function (d) {
          return (d.name || '').toLowerCase().indexOf(q) >= 0 ||
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
      driverUidValid: function () {
        return !this.device || GUID_RE.test(this.device.driverUid);
      },
      title: function () {
        return (this.dirty ? '● ' : '') + (this.fileName || 'Редактор библиотеки значков');
      }
    },

    watch: {
      lib: {
        deep: true,
        handler: function (nv, ov) { if (nv === ov) this.dirty = true; }
      },
      title: {
        immediate: true,
        handler: function (t) { document.title = t; }
      },
      bg: function (v) { savePref('bg', v); },
      deviceKey: function () {
        var s = this.states.find(function (x) { return x.stateClass === 'No'; }) || this.states[0];
        this.stateKey = s ? s.key : null;
      },
      stateKey: function () {
        this.frameIdx = 0;
        if (this.state && !this.state.frames.length && this.state.svgImage !== null) this.tab = 'svg';
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
        if (!(e.ctrlKey || e.metaKey)) return;
        var k = e.key.toLowerCase();
        if (k === 's' || k === 'ы') { e.preventDefault(); e.shiftKey ? self.saveAs() : self.save(); }
        else if (k === 'o' || k === 'щ') { e.preventDefault(); self.open(); }
      });
      window.addEventListener('beforeunload', function (e) {
        if (self.dirty) { e.preventDefault(); e.returnValue = ''; }
      });
    },

    methods: {
      label: function (code) { return RIE.states.label(code); },
      deviceTitle: function (d) { return d.name || 'Без имени'; },
      thumbState: function (d) {
        return d.states.find(function (x) { return x.stateClass === 'No'; }) || d.states[0] || null;
      },
      short: function (guid) { return guid ? guid.slice(0, 8) : '—'; },

      say: function (msg, err) {
        this.status = msg;
        this.statusErr = !!err;
      },

      confirmDiscard: function () {
        return !this.dirty || confirm('Есть несохранённые изменения. Продолжить без сохранения?');
      },

      // ----- Файлы -----
      open: async function () {
        if (!this.confirmDiscard()) return;
        try {
          var f = await RIE.fileio.open();
          if (f) this.load(f);
        } catch (e) {
          this.say('Не удалось открыть файл: ' + e.message, true);
        }
      },

      onDrop: async function (ev) {
        this.dragOver = false;
        var item = ev.dataTransfer.items && ev.dataTransfer.items[0];
        var file = ev.dataTransfer.files[0];
        if (!file || !this.confirmDiscard()) return;
        try {
          var handle = item && item.getAsFileSystemHandle ? await item.getAsFileSystemHandle() : null;
          var f = await RIE.fileio.readFile(file);
          f.handle = handle && handle.kind === 'file' ? handle : null;
          this.load(f);
        } catch (e) {
          this.say('Не удалось открыть файл: ' + e.message, true);
        }
      },

      load: function (f) {
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
        var self = this;
        this.$nextTick(function () { self.dirty = false; });
        this.say('Открыт «' + f.name + '»: устройств ' + lib.devices.length);
      },

      save: async function () {
        if (!this.lib) return;
        if (!this.handle) return this.saveAs();
        try {
          await RIE.fileio.writeHandle(this.handle, R.serialize(this.lib), this.bom);
          this.dirty = false;
          this.say('Сохранено: ' + this.fileName);
        } catch (e) {
          this.say('Не удалось сохранить: ' + e.message, true);
        }
      },

      saveAs: async function () {
        if (!this.lib) return;
        try {
          var res = await RIE.fileio.saveAs(this.fileName || 'Библиотека значков.rlib', R.serialize(this.lib), this.bom);
          if (!res) return;
          this.handle = res.handle;
          this.fileName = res.name;
          this.dirty = false;
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

      deleteDevice: function () {
        var d = this.device;
        if (!confirm('Удалить устройство «' + this.deviceTitle(d) + '» (' + d.uid + ') со всеми состояниями?')) return;
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

      deleteState: function () {
        var s = this.state;
        if (!confirm('Удалить состояние «' + this.label(s.stateClass) + '»?')) return;
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

      deleteFrame: function (i) {
        if (!confirm('Удалить кадр ' + (i + 1) + '?')) return;
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

      deleteSvg: function () {
        if (confirm('Удалить SVG (рисунок для веб-клиента) у этого состояния?')) this.state.svgImage = null;
      }
    }
  });

  function loadPref(k, def) {
    try { return localStorage.getItem('rie.' + k) || def; } catch (e) { return def; }
  }

  function savePref(k, v) {
    try { localStorage.setItem('rie.' + k, v); } catch (e) { /* настройки необязательны */ }
  }

  // Корневой экземпляр доступен для отладки и автотестов
  RIE.app = app.mount('#app');
})(window.RIE);
