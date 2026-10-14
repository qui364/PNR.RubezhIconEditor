// Черновик открытого файла в IndexedDB браузера: переживает перезагрузку страницы и сбой.
// Одна запись { name, text, bom, handle, dirty, base, time }; base — текст последнего сохранения
// (только при dirty, для пометок изменений); handle (FileSystemFileHandle)
// сохраняется, если браузер это умеет, — тогда «Сохранить» после восстановления пишет
// в тот же файл. Данные остаются только в этом браузере, никуда не отправляются.
(function (RIE) {
  'use strict';

  var DB = 'rie', STORE = 'draft', KEY = 'current';
  var dbP = null;

  function db() {
    if (!dbP) {
      dbP = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(new Error('IndexedDB недоступна'));
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      dbP.catch(function () { dbP = null; });
    }
    return dbP;
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), res;
        var req = fn(t.objectStore(STORE));
        if (req) req.onsuccess = function () { res = req.result; };
        t.oncomplete = function () { resolve(res); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }

  // -> запись | undefined
  function load() {
    return tx('readonly', function (s) { return s.get(KEY); });
  }

  function save(rec) {
    rec.time = Date.now();
    return tx('readwrite', function (s) { s.put(rec, KEY); }).catch(function (e) {
      // Хэндл может не сериализоваться (браузер без File System Access API в IDB) — без него
      if (!rec.handle) throw e;
      var r = Object.assign({}, rec, { handle: null });
      return tx('readwrite', function (s) { s.put(r, KEY); });
    });
  }

  function clear() {
    return tx('readwrite', function (s) { s.delete(KEY); });
  }

  RIE.draft = { load: load, save: save, clear: clear };
})(window.RIE = window.RIE || {});
