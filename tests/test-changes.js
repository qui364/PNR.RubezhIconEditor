// Тесты js/changes.js: пометки «изменено» / «новое» относительно последнего сохранения
(function () {
  'use strict';

  var R = RIE.rlib, C = RIE.changes;

  function findFramed(lib) {
    for (var i = 0; i < lib.devices.length; i++) {
      var st = lib.devices[i].states;
      for (var j = 0; j < st.length; j++) if (st[j].frames.length) return { d: lib.devices[i], s: st[j] };
    }
    return null;
  }

  function count(lib, base) {
    var n = 0;
    lib.devices.forEach(function (d) { if (C.status(base, d)) n++; });
    return n;
  }

  T.perFile('changes: без правок пометок нет, правка и откат', function (f) {
    var lib = R.parse(f.text);
    var base = C.snapshot(lib);
    T.eq(count(lib, base), 0, 'после открытия');
    var at = findFramed(lib);
    if (!at) return;
    var fr = at.s.frames[0], old = fr.image;
    fr.image = old + ' ';
    T.eq(C.status(base, fr), 'changed', 'кадр');
    T.eq(C.status(base, at.s), 'changed', 'состояние');
    T.eq(C.status(base, at.d), 'changed', 'устройство');
    T.eq(count(lib, base), 1, 'изменённых устройств');
    fr.image = old;
    T.eq(count(lib, base), 0, 'после отката');
  });

  T.perFile('changes: новые, удалённые, перестановка кадров', function (f) {
    var lib = R.parse(f.text);
    var base = C.snapshot(lib);
    var at = findFramed(lib);
    if (!at) return;
    var nf = R.newFrame(99, 500, R.EMPTY_CANVAS);
    at.s.frames.push(nf);
    T.eq(C.status(base, nf), 'new', 'новый кадр');
    T.eq(C.status(base, at.s), 'changed', 'состояние с новым кадром');
    at.s.frames.pop();
    T.eq(C.status(base, at.s), '', 'кадр убран');
    var copy = R.cloneDevice(at.d);
    lib.devices.push(copy);
    T.eq(C.status(base, copy), 'new', 'копия устройства');
    T.eq(C.status(base, copy.states[0]), 'new', 'состояние копии');
    lib.devices.pop();
    var removed = lib.devices.shift();
    var sum = C.summary(base, lib);
    T.eq(sum.removed, 1, 'удалено');
    T.eq(sum.changed + sum.added, 0, 'прочие');
    lib.devices.unshift(removed);
    if (at.s.frames.length > 1) {
      at.s.frames.reverse();
      T.eq(C.status(base, at.s), 'changed', 'перестановка кадров');
      at.s.frames.reverse();
    }
    T.eq(C.summary(base, lib).removed, 0, 'вернули');
  });

  T.perFile('changes: база из другой копии файла (черновик)', function (f) {
    var orig = R.parse(f.text);
    var lib = R.parse(f.text);
    var base = C.snapshot(lib, orig);
    T.eq(count(lib, base), 0, 'та же копия');
    var at = findFramed(lib);
    if (!at) return;
    at.s.frames[0].duration += 1;
    var edited = R.serialize(lib);
    var lib2 = R.parse(edited);
    var base2 = C.snapshot(lib2, R.parse(f.text));
    T.eq(count(lib2, base2), 1, 'изменённых устройств после перечитывания');
  });
})();
