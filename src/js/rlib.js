// Модель библиотеки значков (.rlib) поверх RIE.xml.
// Неизменённые текстовые поля пишутся исходным сырым текстом — это даёт побайтовый round-trip.
// Неизвестные дочерние элементы сохраняются и пишутся после известных.
(function (RIE) {
  'use strict';

  var X = RIE.xml;
  var keySeq = 0;

  function markRaw(o) {
    return window.Vue ? Vue.markRaw(o) : o;
  }

  function newKey() {
    return ++keySeq;
  }

  function newGuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // Исходные элементы полей: o[field] = [значение при чтении, исходный элемент]
  function readText(obj, field, e) {
    var v = X.decode(e.text || '');
    obj[field] = v;
    obj._o[field] = [v, e];
  }

  function writeText(obj, field, tag, value) {
    var orig = obj._o && obj._o[field];
    if (orig && orig[0] === value) return orig[1];
    var e = X.el(tag, [], X.encodeText(value));
    e.selfClosing = value === '';
    return X.keepWs(e, orig && orig[1]);
  }

  function container(obj, field, tag, items) {
    var orig = obj._o && obj._o[field];
    var e = X.el(tag, items.concat(orig ? orig.extra : []));
    if (orig) {
      e.attrs = orig.el.attrs;
      X.keepWs(e, orig.el);
    }
    e.selfClosing = !e.children.length;
    return e;
  }

  function readContainer(obj, field, e, itemTag, readItem) {
    var items = [];
    var extra = [];
    e.children.forEach(function (c) {
      if (c.name === itemTag) items.push(readItem(c));
      else extra.push(c);
    });
    obj._o[field] = { el: e, extra: extra };
    return items;
  }

  // ---------- Кадр ----------
  function readFrame(e) {
    var f = { key: newKey(), id: 0, duration: 500, image: '', extra: [], _o: markRaw({ el: e }) };
    e.children.forEach(function (c) {
      switch (c.name) {
        case 'Id': f.id = readNum(f, 'id', c); break;
        case 'Duration': f.duration = readNum(f, 'duration', c); break;
        case 'Image': readText(f, 'image', c); break;
        default: f.extra.push(c);
      }
    });
    f.extra = markRaw(f.extra);
    return f;
  }

  // Числовое поле: в модели — целое, исходный текст («1,1», «0500») — только в _o
  // и пишется как есть, пока число не меняли
  function readNum(obj, field, e) {
    var v = X.decode(e.text || '');
    obj._o[field] = [v, e];
    return parseInt(v, 10) || 0;
  }

  function numText(obj, field) {
    var orig = obj._o && obj._o[field];
    return orig && (parseInt(orig[0], 10) || 0) === obj[field] ? orig[0] : String(obj[field]);
  }

  function writeFrame(f) {
    return X.keepWs(X.el('GKLibraryFrame', [
      writeText(f, 'id', 'Id', numText(f, 'id')),
      writeText(f, 'duration', 'Duration', numText(f, 'duration')),
      writeText(f, 'image', 'Image', f.image)
    ].concat(f.extra || [])), f._o.el);
  }

  function newFrame(id, duration, image) {
    return { key: newKey(), id: id, duration: duration, image: image, extra: markRaw([]), _o: markRaw({}) };
  }

  // ---------- Состояние ----------
  function readState(e) {
    var s = { key: newKey(), stateClass: '', frames: [], svgImage: null, layer: '0', extra: [], _o: markRaw({ el: e }) };
    e.children.forEach(function (c) {
      switch (c.name) {
        case 'StateClass': readText(s, 'stateClass', c); break;
        case 'Frames': s.frames = readContainer(s, 'frames', c, 'GKLibraryFrame', readFrame); break;
        case 'SvgImage': readText(s, 'svgImage', c); break;
        case 'Layer': readText(s, 'layer', c); break;
        default: s.extra.push(c);
      }
    });
    s.extra = markRaw(s.extra);
    return s;
  }

  function writeState(s) {
    var ch = [
      writeText(s, 'stateClass', 'StateClass', s.stateClass),
      container(s, 'frames', 'Frames', s.frames.map(writeFrame))
    ];
    if (s.svgImage !== null) ch.push(writeText(s, 'svgImage', 'SvgImage', s.svgImage));
    ch.push(writeText(s, 'layer', 'Layer', s.layer));
    return X.keepWs(X.el('GKLibraryState', ch.concat(s.extra || [])), s._o.el);
  }

  function newState(stateClass) {
    return { key: newKey(), stateClass: stateClass, frames: [], svgImage: null, layer: '0', extra: markRaw([]), _o: markRaw({}) };
  }

  // ---------- Устройство ----------
  function readDevice(e) {
    var d = { key: newKey(), uid: '', driverUid: '', name: null, states: [], extra: [], _o: markRaw({ el: e }) };
    e.children.forEach(function (c) {
      switch (c.name) {
        case 'UID': readText(d, 'uid', c); break;
        case 'DriverUID': readText(d, 'driverUid', c); break;
        case 'Name': readText(d, 'name', c); break;
        case 'States': d.states = readContainer(d, 'states', c, 'GKLibraryState', readState); break;
        default: d.extra.push(c);
      }
    });
    d.extra = markRaw(d.extra);
    return d;
  }

  function writeDevice(d) {
    var ch = [
      writeText(d, 'uid', 'UID', d.uid),
      writeText(d, 'driverUid', 'DriverUID', d.driverUid)
    ];
    if (d.name !== null) ch.push(writeText(d, 'name', 'Name', d.name));
    ch.push(container(d, 'states', 'States', d.states.map(writeState)));
    return X.keepWs(X.el('GKLibraryDevice', ch.concat(d.extra || [])), d._o.el);
  }

  // ---------- Библиотека ----------
  function parse(text) {
    var doc = X.parse(text);
    if (doc.root.name !== 'GKDeviceLibraryConfiguration') {
      throw new Error('Это не библиотека значков: корневой элемент <' + doc.root.name + '>');
    }
    var lib = { devices: [], _o: markRaw({}) };
    var hasDevices = false;
    doc.root.children.forEach(function (c) {
      if (c.name === 'GKDevices') {
        hasDevices = true;
        lib.devices = readContainer(lib, 'devices', c, 'GKLibraryDevice', readDevice);
      }
    });
    if (!hasDevices) throw new Error('В файле нет раздела GKDevices');
    lib._o.doc = doc;
    return lib;
  }

  function serialize(lib) {
    var d = lib._o.doc;
    var root = X.el(d.root.name, d.root.children.map(function (c) {
      return c.name === 'GKDevices' ? container(lib, 'devices', 'GKDevices', lib.devices.map(writeDevice)) : c;
    }));
    root.attrs = d.root.attrs;
    X.keepWs(root, d.root);
    return X.write(Object.assign({}, d, { root: root }));
  }

  // Копии: исходные сырые элементы (_o, extra) неизменяемы, их можно разделять.
  function cloneFrame(f) {
    return Object.assign({}, f, { key: newKey() });
  }

  function cloneState(s) {
    return Object.assign({}, s, { key: newKey(), frames: s.frames.map(cloneFrame) });
  }

  function cloneDevice(d) {
    return Object.assign({}, d, { key: newKey(), uid: newGuid(), states: d.states.map(cloneState) });
  }

  var EMPTY_CANVAS = '<?xml version="1.0" encoding="utf-16"?>\n' +
    '<Canvas Width="500" Height="500" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">\n' +
    '</Canvas>';

  RIE.rlib = {
    parse: parse,
    serialize: serialize,
    newFrame: newFrame,
    newState: newState,
    cloneFrame: cloneFrame,
    cloneState: cloneState,
    cloneDevice: cloneDevice,
    newGuid: newGuid,
    EMPTY_CANVAS: EMPTY_CANVAS
  };
})(window.RIE = window.RIE || {});
