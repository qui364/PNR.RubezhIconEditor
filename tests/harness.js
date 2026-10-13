// Минимальный тестовый раннер без зависимостей: T.test(имя, fn), проверки T.eq/T.ok/T.throws.
// Тесты на примерах — T.perFile(имя, fn(файл)): выполняются для каждой загруженной библиотеки.
// Итог — в <pre id="report"> и последней строкой «RESULT: PASS|FAIL …» (её ищут run.ps1 и CI).
(function () {
  'use strict';

  var tests = [];
  var fileTests = [];

  function test(name, fn) { tests.push({ name: name, fn: fn }); }
  function perFile(name, fn) { fileTests.push({ name: name, fn: fn }); }

  function show(v) {
    if (typeof v === 'string') return JSON.stringify(v.length > 200 ? v.slice(0, 200) + '…' : v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function fail(msg) {
    var e = new Error(msg);
    e.name = 'AssertError';
    throw e;
  }

  function eq(actual, expected, msg) {
    if (actual !== expected) fail((msg ? msg + ': ' : '') + 'получено ' + show(actual) + ', ожидалось ' + show(expected));
  }

  function ok(cond, msg) {
    if (!cond) fail(msg || 'условие не выполнено');
  }

  function throws(fn, re, msg) {
    try {
      fn();
    } catch (e) {
      if (re && !re.test(e.message)) fail((msg ? msg + ': ' : '') + 'не то исключение: ' + e.message);
      return e;
    }
    fail((msg ? msg + ': ' : '') + 'исключения не было');
  }

  // Первое расхождение двух строк/массивов байт — для понятных сообщений
  function diffAt(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return a.length === b.length ? -1 : n;
  }

  // Область, где строки различаются: [start, endA) в a и [start, endB) в b
  function diffRegion(a, b) {
    var start = diffAt(a, b);
    if (start < 0) return null;
    var ea = a.length, eb = b.length;
    while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    return { start: start, endA: ea, endB: eb };
  }

  // ---------- Файлы ----------
  var enc = new TextEncoder();

  // Как RIE.fileio: TextDecoder срезает BOM, признак BOM хранится отдельно
  function decodeFile(name, bytes) {
    var bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    return { name: name, bytes: bytes, text: new TextDecoder('utf-8').decode(bytes), bom: bom };
  }

  // То, что запишет приложение при сохранении
  function encodeFile(text, bom) {
    var body = enc.encode(text);
    if (!bom) return body;
    var out = new Uint8Array(body.length + 3);
    out.set([0xEF, 0xBB, 0xBF]);
    out.set(body, 3);
    return out;
  }

  function defaultFile() {
    var bin = atob(RIE.defaultRlib);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { name: 'Default.rlib (data/default-rlib.js)', bytes: bytes };
  }

  // XHR, а не fetch: fetch на file:// не работает даже с --allow-file-access-from-files.
  // Синхронный XHR не годится: с BOM браузер декодирует ответ как UTF-8, а нужны байты.
  function loadExamples(names) {
    return Promise.all(names.map(function (name) {
      return new Promise(function (resolve) {
        var x = new XMLHttpRequest();
        x.open('GET', '../examples/' + encodeURIComponent(name));
        x.responseType = 'arraybuffer';
        x.onload = function () {
          if ((x.status === 0 || x.status === 200) && x.response && x.response.byteLength) {
            resolve({ name: name, bytes: new Uint8Array(x.response) });
          } else {
            resolve({ name: name, error: 'статус ' + x.status });
          }
        };
        x.onerror = function () { resolve({ name: name, error: 'нет доступа (file:// без --allow-file-access-from-files?)' }); };
        x.send();
      });
    })).then(function (list) {
      return {
        files: list.filter(function (f) { return !f.error; }),
        errors: list.filter(function (f) { return f.error; }).map(function (f) {
          return 'Не удалось прочитать examples/' + f.name + ': ' + f.error;
        })
      };
    });
  }

  // ---------- Запуск ----------
  function runAll(input) {
    var files = [defaultFile()].concat(input.files).map(function (f) { return decodeFile(f.name, f.bytes); });
    var lines = [], passed = 0, failed = 0;
    var notes = [];

    function run(name, fn) {
      try {
        fn();
        passed++;
      } catch (e) {
        failed++;
        lines.push('✗ ' + name + '\n    ' + (e.name === 'AssertError' ? e.message : (e.stack || e.message)).replace(/\n/g, '\n    '));
      }
    }

    input.errors.forEach(function (m) { failed++; lines.push('✗ ' + m); });
    tests.forEach(function (t) { run(t.name, t.fn); });
    files.forEach(function (f) {
      fileTests.forEach(function (t) { run(t.name + ' — ' + f.name, function () { t.fn(f, notes); }); });
    });

    var head = 'Файлы: ' + files.map(function (f) { return f.name; }).join(', ') + '\n';
    var res = 'RESULT: ' + (failed ? 'FAIL ' + failed + ' из ' + (passed + failed) : 'PASS ' + passed);
    var report = document.getElementById('report');
    report.className = failed ? 'fail' : 'pass';
    report.textContent = head + (notes.length ? '\n' + notes.join('\n') + '\n' : '') +
      (lines.length ? '\n' + lines.join('\n') + '\n' : '') + '\n' + res;
    document.title = (failed ? 'FAIL' : 'PASS') + ' | Тесты';
  }

  window.T = {
    test: test, perFile: perFile, eq: eq, ok: ok, throws: throws, fail: fail,
    diffAt: diffAt, diffRegion: diffRegion, decodeFile: decodeFile, encodeFile: encodeFile,
    loadExamples: loadExamples, runAll: runAll
  };
})();
