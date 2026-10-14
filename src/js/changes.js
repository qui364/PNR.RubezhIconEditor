// Пометки «изменено» / «новое»: сравнение модели с последним сохранённым (или открытым) файлом.
// База — снимок значений полей по ключам объектов модели (key). Вернул правку — пометка пропала.
// Снимок можно снять с другой разобранной копии файла (черновик: правленый текст + исходный):
// устройства сопоставляются по UID, состояния — по StateClass, кадры — по Id
// (повторы — по порядку вхождения).
(function (RIE) {
  'use strict';

  var holeSeq = 0;

  // Для каждого элемента old — элемент cur с тем же id (по порядку вхождения) или null
  function pair(cur, old, id) {
    var pool = new Map();
    cur.forEach(function (c) {
      var k = id(c);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(c);
    });
    return old.map(function (o) {
      var p = pool.get(id(o));
      return p && p.length ? p.shift() : null;
    });
  }

  // Ключ сопоставленного объекта; у несопоставленного — «дырка», которой нет в модели
  function keyOf(c) {
    return c ? c.key : 'x' + (++holeSeq);
  }

  function putFrames(m, cur, old) {
    var p = pair(cur, old, function (f) { return String(f.id); });
    return old.map(function (o, i) {
      if (p[i]) m.set(p[i].key, { id: o.id, duration: o.duration, image: o.image });
      return keyOf(p[i]);
    });
  }

  function putStates(m, cur, old) {
    var p = pair(cur, old, function (s) { return s.stateClass; });
    return old.map(function (o, i) {
      var c = p[i];
      if (c) {
        m.set(c.key, {
          stateClass: o.stateClass, svgImage: o.svgImage, layer: o.layer,
          frames: putFrames(m, c.frames, o.frames)
        });
      }
      return keyOf(c);
    });
  }

  // lib — текущая модель; from — модель, с которой снимается база (по умолчанию lib)
  function snapshot(lib, from) {
    var m = new Map();
    from = from || lib;
    var p = pair(lib.devices, from.devices, function (d) { return d.uid.toLowerCase(); });
    var devices = from.devices.map(function (o, i) {
      var c = p[i];
      if (c) {
        m.set(c.key, {
          uid: o.uid, driverUid: o.driverUid, name: o.name,
          states: putStates(m, c.states, o.states)
        });
      }
      return keyOf(c);
    });
    return { m: m, devices: devices };
  }

  function sameKeys(list, keys) {
    if (list.length !== keys.length) return false;
    for (var i = 0; i < keys.length; i++) if (list[i].key !== keys[i]) return false;
    return true;
  }

  function frameStatus(base, f) {
    var b = base.m.get(f.key);
    if (!b) return 'new';
    return b.id !== f.id || b.duration !== f.duration || b.image !== f.image ? 'changed' : '';
  }

  function stateStatus(base, s) {
    var b = base.m.get(s.key);
    if (!b) return 'new';
    if (b.stateClass !== s.stateClass || b.svgImage !== s.svgImage || b.layer !== s.layer ||
        !sameKeys(s.frames, b.frames)) return 'changed';
    return s.frames.some(function (f) { return frameStatus(base, f); }) ? 'changed' : '';
  }

  function deviceStatus(base, d) {
    var b = base.m.get(d.key);
    if (!b) return 'new';
    if (b.uid !== d.uid || b.driverUid !== d.driverUid || b.name !== d.name ||
        !sameKeys(d.states, b.states)) return 'changed';
    return d.states.some(function (s) { return stateStatus(base, s); }) ? 'changed' : '';
  }

  // '' | 'changed' | 'new' для устройства, состояния или кадра
  function status(base, o) {
    if (!base) return '';
    return o.states ? deviceStatus(base, o) : o.frames ? stateStatus(base, o) : frameStatus(base, o);
  }

  // То же для одного поля объекта (например, svgImage состояния)
  function field(base, o, name) {
    if (!base) return '';
    var b = base.m.get(o.key);
    return !b ? 'new' : b[name] !== o[name] ? 'changed' : '';
  }

  // Итог по устройствам: { changed, added, removed }
  function summary(base, lib) {
    var r = { changed: 0, added: 0, removed: 0 };
    if (!base) return r;
    var have = new Set();
    lib.devices.forEach(function (d) {
      have.add(d.key);
      var st = deviceStatus(base, d);
      if (st === 'new') r.added++;
      else if (st) r.changed++;
    });
    base.devices.forEach(function (k) { if (!have.has(k)) r.removed++; });
    return r;
  }

  RIE.changes = { snapshot: snapshot, status: status, field: field, summary: summary };
})(window.RIE = window.RIE || {});
