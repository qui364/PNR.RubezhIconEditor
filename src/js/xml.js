// Минимальный XML-ридер/райтер без потерь для файлов .rlib (вывод .NET XmlSerializer).
// DOMParser не используется: XML-парсеры нормализуют CRLF в тексте, а нам нужен
// побайтовый round-trip. Текст элементов хранится в сыром (экранированном) виде.
(function (RIE) {
  'use strict';

  var ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

  function decode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e[0] !== '#') return ENT[e];
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }

  // Как XmlSerializer: в тексте экранируются только & < >
  function encodeText(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function encodeAttr(s) {
    return encodeText(s).replace(/"/g, '&quot;');
  }

  function XmlError(msg, src, pos) {
    var line = src.slice(0, pos).split('\n').length;
    var e = new Error(msg + ' (строка ' + line + ')');
    e.name = 'XmlError';
    return e;
  }

  // Элемент: { name, attrs: [{name, raw, q}], children: [], text: raw|null, selfClosing }
  function el(name, children, text) {
    return { name: name, attrs: [], children: children || [], text: text === undefined ? null : text, selfClosing: false };
  }

  var TAG_RE = /<([^\s\/>!?]+)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
  var ATTR_RE = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  function parse(src) {
    var m = /^﻿?(?:<\?xml[^?]*\?>)?\s*/.exec(src);
    var prolog = m[0];
    var p = prolog.length;
    var newline = /\r\n/.test(prolog) ? '\r\n' : (/\n/.test(prolog) ? '\n' : '\r\n');
    var closeSpace = null; // стиль пустых тегов: " />" (XmlSerializer) или "/>"
    var stack = [];
    var root = null;
    var cur = null;

    while (p < src.length) {
      var lt = src.indexOf('<', p);
      if (lt < 0) lt = src.length;
      if (lt > p) {
        var t = src.slice(p, lt);
        if (!cur) {
          if (root && lt === src.length) break; // хвост после корня
          throw XmlError('Текст вне корневого элемента', src, p);
        }
        cur._text = (cur._text || '') + t;
        p = lt;
        continue;
      }
      if (src.startsWith('</', p)) {
        var gt = src.indexOf('>', p);
        var name = src.slice(p + 2, gt).trim();
        if (!cur || cur.name !== name) throw XmlError('Непарный закрывающий тег </' + name + '>', src, p);
        finish(cur, src, p);
        stack.pop();
        cur = stack[stack.length - 1] || null;
        p = gt + 1;
        if (!cur) break;
        continue;
      }
      if (src[p + 1] === '!' || src[p + 1] === '?') {
        throw XmlError('Комментарии, CDATA и инструкции внутри документа не поддерживаются', src, p);
      }
      TAG_RE.lastIndex = p;
      var tm = TAG_RE.exec(src);
      if (!tm) throw XmlError('Некорректный тег', src, p);
      var e = el(tm[1]);
      var am;
      ATTR_RE.lastIndex = 0;
      while ((am = ATTR_RE.exec(tm[2]))) {
        var dq = am[2] !== undefined;
        e.attrs.push({ name: am[1], raw: dq ? am[2] : am[3], q: dq ? '"' : "'" });
      }
      if (cur) {
        if (cur._text && /\S/.test(cur._text)) throw XmlError('Смешанное содержимое в <' + cur.name + '> не поддерживается', src, p);
        e.ws = cur._text || '';
        cur._text = undefined;
        cur.children.push(e);
      } else if (root) {
        throw XmlError('Больше одного корневого элемента', src, p);
      } else {
        root = e;
      }
      p += tm[0].length;
      if (tm[3]) {
        e.selfClosing = true;
        if (closeSpace === null) closeSpace = /\s\/>$/.test(tm[0]);
        if (!cur) break;
      } else {
        stack.push(e);
        cur = e;
      }
    }
    if (stack.length) throw XmlError('Файл обрывается внутри <' + stack[stack.length - 1].name + '>', src, src.length);
    if (!root) throw XmlError('Нет корневого элемента', src, 0);
    var epilog = src.slice(p);
    if (/\S/.test(epilog)) throw XmlError('Данные после корневого элемента', src, p);
    return { prolog: prolog, epilog: epilog, newline: newline, closeSpace: closeSpace !== false, root: root };
  }

  function finish(e, src, pos) {
    if (e.children.length) {
      if (e._text && /\S/.test(e._text)) throw XmlError('Смешанное содержимое в <' + e.name + '> не поддерживается', src, pos);
      e.wsEnd = e._text || '';
    } else {
      e.text = e._text || '';
    }
    delete e._text;
  }

  // Пишет в стиле XmlSerializer: отступ 2 пробела; перевод строк и вид пустых тегов — как в исходном файле.
  // Пробелы между элементами из исходного файла (ws — перед элементом, wsEnd — перед
  // закрывающим тегом) сохраняются; у новых элементов — стандартный отступ.
  function write(doc) {
    var out = [doc.prolog];
    writeEl(doc.root, '', out, { nl: doc.newline, close: doc.closeSpace === false ? '/>' : ' />' });
    out.push(doc.epilog);
    return out.join('');
  }

  function writeEl(e, ind, out, style) {
    var nl = style.nl;
    out.push('<', e.name);
    for (var i = 0; i < e.attrs.length; i++) {
      var a = e.attrs[i];
      out.push(' ', a.name, '=', a.q, a.raw, a.q);
    }
    if (e.children.length) {
      out.push('>');
      var ind2 = ind + '  ';
      for (var j = 0; j < e.children.length; j++) {
        var c = e.children[j];
        out.push(c.ws !== undefined ? c.ws : nl + ind2);
        writeEl(c, ind2, out, style);
      }
      out.push(e.wsEnd !== undefined ? e.wsEnd : nl + ind, '</', e.name, '>');
    } else if (e.selfClosing || e.text === null) {
      out.push(style.close);
    } else {
      out.push('>', e.text, '</', e.name, '>');
    }
  }

  // Переносит исходные пробелы со старого элемента на пересобранный
  function keepWs(e, orig) {
    if (orig) {
      e.ws = orig.ws;
      e.wsEnd = orig.wsEnd;
    }
    return e;
  }

  RIE.xml = { parse: parse, write: write, el: el, keepWs: keepWs, decode: decode, encodeText: encodeText, encodeAttr: encodeAttr };
})(window.RIE = window.RIE || {});
