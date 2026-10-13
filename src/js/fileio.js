// Открытие/сохранение файлов: File System Access API (Chrome/Edge) с фолбэком
// на <input type=file> и скачивание.
(function (RIE) {
  'use strict';

  var TYPES = [{ description: 'Библиотека значков', accept: { 'application/xml': ['.rlib'] } }];
  var canPick = typeof window.showOpenFilePicker === 'function';

  async function readFile(file) {
    return decode(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  function decode(name, bytes) {
    var bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    return { name: name, text: new TextDecoder('utf-8').decode(bytes), bom: bom };
  }

  // Заводская библиотека из data/default-rlib.js. Подгружается тегом <script> по запросу:
  // так работает и на сайте, и на file://, где fetch локальных файлов запрещён.
  function openDefault() {
    return new Promise(function (resolve, reject) {
      function done() {
        var bin = atob(RIE.defaultRlib);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(decode('Default.rlib', bytes));
      }
      if (RIE.defaultRlib) return done();
      var s = document.createElement('script');
      s.src = 'data/default-rlib.js';
      s.onload = done;
      s.onerror = function () { s.remove(); reject(new Error('нет файла data/default-rlib.js')); };
      document.head.appendChild(s);
    });
  }

  function pickViaInput() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.rlib';
      input.onchange = function () { resolve(input.files[0] || null); };
      input.click();
    });
  }

  // -> { name, text, bom, handle } | null (отмена)
  async function open() {
    if (canPick) {
      var handles;
      try {
        handles = await window.showOpenFilePicker({ types: TYPES });
      } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
      }
      var res = await readFile(await handles[0].getFile());
      res.handle = handles[0];
      return res;
    }
    var file = await pickViaInput();
    return file ? readFile(file) : null;
  }

  function blob(text, bom) {
    return new Blob([bom ? '﻿' : '', text], { type: 'application/xml' });
  }

  async function writeHandle(handle, text, bom) {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Нет разрешения на запись в файл');
    }
    var w = await handle.createWritable();
    await w.write(blob(text, bom));
    await w.close();
  }

  function download(name, text, bom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob(text, bom));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // -> { handle, name } | null (отмена). Без File System Access API — скачивание.
  async function saveAs(name, text, bom) {
    if (typeof window.showSaveFilePicker === 'function') {
      var handle;
      try {
        handle = await window.showSaveFilePicker({ suggestedName: name, types: TYPES });
      } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
      }
      await writeHandle(handle, text, bom);
      return { handle: handle, name: handle.name };
    }
    download(name, text, bom);
    return { handle: null, name: name, downloaded: true };
  }

  RIE.fileio = { open: open, openDefault: openDefault, readFile: readFile, writeHandle: writeHandle, saveAs: saveAs, canSaveInPlace: canPick };
})(window.RIE = window.RIE || {});
