// Открытие/сохранение файлов: File System Access API (Chrome/Edge) с фолбэком
// на <input type=file> и скачивание.
(function (RIE) {
  'use strict';

  var TYPES = [{ description: 'Библиотека значков', accept: { 'application/xml': ['.rlib'] } }];
  var canPick = typeof window.showOpenFilePicker === 'function';

  async function readFile(file) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    return { name: file.name, text: new TextDecoder('utf-8').decode(bytes), bom: bom };
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

  RIE.fileio = { open: open, readFile: readFile, writeHandle: writeHandle, saveAs: saveAs, canSaveInPlace: canPick };
})(window.RIE = window.RIE || {});
