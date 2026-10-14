// Текстовый редактор кода: подсветка синтаксиса XML/CSS (HTML для слоя под textarea)
// и форматирование по кнопке. Разбор терпим к незаконченному тексту — он набирается вживую.
(function (RIE) {
  'use strict';

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, s) {
    return s ? '<span class="hl-' + cls + '">' + esc(s) + '</span>' : '';
  }

  // Язык текста SvgImage: SVG (XML) или CSS-фрагмент
  function detect(text) {
    return /^\s*</.test(text) ? 'xml' : 'css';
  }

  // ---------- XML: токены ----------
  // { t: 'meta'|'comment'|'cdata'|'text'|'tag', raw, ... }; у тега: close, name, attrs[], self, end
  // attrs: { ws, name, eq, value } — value с кавычками; end — '>' / '/>' / '' (не закрыт)
  function xmlTokens(s) {
    var out = [], i = 0, n = s.length, m;
    while (i < n) {
      var lt = s.indexOf('<', i);
      if (lt < 0) lt = n;
      if (lt > i) { out.push({ t: 'text', raw: s.slice(i, lt) }); i = lt; continue; }
      var rest = s.slice(i);
      if (rest.indexOf('<!--') === 0) i = push('comment', '-->');
      else if (rest.indexOf('<![CDATA[') === 0) i = push('cdata', ']]>');
      else if (rest.indexOf('<?') === 0) i = push('meta', '?>');
      else if (/^<![A-Za-z]/.test(rest)) i = push('meta', '>');
      else if ((m = /^<(\/?)([^\s/>"'=<]*)/.exec(rest)) && (m[1] || m[2])) i = tag(m);
      else { out.push({ t: 'text', raw: '<' }); i++; }
    }
    return out;

    function push(t, endStr) {
      var e = s.indexOf(endStr, i + 2);
      var end = e < 0 ? n : e + endStr.length;
      out.push({ t: t, raw: s.slice(i, end), closed: e >= 0 });
      return end;
    }

    function tag(m) {
      var tk = { t: 'tag', close: !!m[1], name: m[2], attrs: [], end: '', tail: '' };
      var j = i + m[0].length, a;
      var re = /(\s*)([^\s=/>"'<]+)(?:(\s*=\s*)("[^"]*"?|'[^']*'?|[^\s/>"'<]*))?/y;
      for (;;) {
        re.lastIndex = j;
        if (!(a = re.exec(s)) || !a[0]) break;
        tk.attrs.push({ ws: a[1], name: a[2], eq: a[3] || '', value: a[4] === undefined ? null : a[4] });
        j = re.lastIndex;
      }
      var e = /\s*(\/?>)?/y;
      e.lastIndex = j;
      a = e.exec(s);
      tk.tail = a[0].slice(0, a[0].length - (a[1] || '').length);
      tk.end = a[1] || '';
      j += a[0].length;
      // Мусор внутри тега (лишняя кавычка, «=» без имени) — до конца тега текстом
      if (!tk.end && j < n && s[j] !== '<') {
        var k = s.indexOf('>', j);
        var lt = s.indexOf('<', j);
        if (k < 0 || lt >= 0 && lt < k) k = lt >= 0 ? lt - 1 : n - 1;
        tk.junk = s.slice(j, k + 1);
        if (/\/?>$/.test(tk.junk)) { tk.end = /\/>$/.test(tk.junk) ? '/>' : '>'; tk.junk = tk.junk.slice(0, -tk.end.length); }
        j = k + 1;
      }
      tk.self = tk.end === '/>';
      tk.raw = s.slice(i, j);
      out.push(tk);
      return j;
    }
  }

  function xmlHtml(text) {
    return xmlTokens(text).map(function (tk) {
      if (tk.t === 'text') return text_(tk.raw);
      if (tk.t !== 'tag') return span(tk.t === 'cdata' ? 'value' : tk.t, tk.raw);
      var h = span('punct', tk.close ? '</' : '<') + span('tag', tk.name);
      tk.attrs.forEach(function (a) {
        h += esc(a.ws) + span('attr', a.name);
        if (a.value !== null) h += span('punct', a.eq) + span('value', a.value);
      });
      return h + esc(tk.tail) + (tk.junk ? span('error', tk.junk) : '') + span('punct', tk.end);
    }).join('');

    // Ссылки на сущности (&amp;) в тексте — отдельным цветом
    function text_(s) {
      return s.split(/(&[#\w]+;)/).map(function (p, k) { return k % 2 ? span('meta', p) : esc(p); }).join('');
    }
  }

  // ---------- CSS ----------
  // Отрезки между { } ; — перед «{» селектор (или @-правило), иначе объявление «свойство: значение»
  function cssHtml(s) {
    var h = '', i = 0, n = s.length;
    while (i < n) {
      if (s.startsWith('/*', i)) {
        var e = s.indexOf('*/', i + 2);
        e = e < 0 ? n : e + 2;
        h += span('comment', s.slice(i, e));
        i = e;
        continue;
      }
      var c = s[i];
      if (c === '{' || c === '}' || c === ';') { h += span('punct', c); i++; continue; }
      var j = segEnd(s, i);
      var seg = s.slice(i, j);
      var term = nextTerm(s, j);
      if (term === '{') {
        h += span(/^\s*@/.test(seg) ? 'meta' : 'tag', seg);
      } else {
        var colon = seg.indexOf(':');
        if (colon < 0) h += span('attr', seg);
        else h += span('attr', seg.slice(0, colon)) + span('punct', ':') + span('value', seg.slice(colon + 1));
      }
      i = j;
    }
    return h;
  }

  // Конец отрезка: { } ; или начало комментария; строки в кавычках пропускаются целиком
  function segEnd(s, i) {
    for (var n = s.length; i < n; i++) {
      var c = s[i];
      if (c === '{' || c === '}' || c === ';' || c === '/' && s[i + 1] === '*') return i;
      if (c === '"' || c === "'") {
        var e = s.indexOf(c, i + 1);
        if (e < 0) return n;
        i = e;
      }
    }
    return n;
  }

  // Ближайший разделитель после позиции (комментарии пропускаются)
  function nextTerm(s, i) {
    while (i < s.length) {
      if (s.startsWith('/*', i)) {
        var e = s.indexOf('*/', i + 2);
        if (e < 0) return '';
        i = e + 2;
        continue;
      }
      var c = s[i];
      if (c === '{' || c === '}' || c === ';') return c;
      i = segEnd(s, i + 1);
    }
    return '';
  }

  function highlight(text, lang) {
    if (lang === 'auto') lang = detect(text);
    return lang === 'css' ? cssHtml(text) : xmlHtml(text);
  }

  // ---------- Форматирование ----------
  var INDENT = '  ';

  function newline(text) {
    return text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  }

  // Отступы по вложенности; элемент только с текстом (TextBlock) — в одну строку, текст как есть.
  // Атрибуты: пробелы вокруг «=» убираются, значения не меняются;
  // columns — у тегов с 2+ атрибутами каждый атрибут на своей строке, иначе тег в одну строку.
  function formatXml(text, columns) {
    var tks = xmlTokens(text), lines = [], depth = 0, stack = [];
    tks.forEach(function (tk) {
      if (tk.t === 'tag' && (!tk.end || tk.junk)) throw new Error('незакрытый или некорректный тег <' + tk.name + '>');
      if (tk.t !== 'tag' && tk.t !== 'text' && tk.closed === false) throw new Error('незакрытый ' + (tk.t === 'comment' ? 'комментарий' : 'блок ' + tk.raw.slice(0, 9)));
      if (tk.t === 'tag' && !tk.close && tk.attrs.some(function (a) { return a.value !== null && !/^(["']).*\1$/.test(a.value); })) {
        throw new Error('значение атрибута без кавычек в <' + tk.name + '>');
      }
    });
    for (var k = 0; k < tks.length; k++) {
      var tk = tks[k];
      if (tk.t === 'text') {
        if (tk.raw.trim()) line(tk.raw.trim());
      } else if (tk.t !== 'tag') {
        line(tk.raw);
      } else if (tk.close) {
        if (stack.pop() !== tk.name) throw new Error('лишний или непарный </' + tk.name + '>');
        depth--;
        line('</' + tk.name + '>');
      } else if (tk.self) {
        line(open(tk, depth, columns));
      } else {
        var t = tks[k + 1], c = tks[k + 2];
        if (t && t.t === 'text' && c && c.t === 'tag' && c.close && c.name === tk.name && t.raw.indexOf('\n') < 0) {
          line(open(tk, depth, columns) + t.raw + '</' + tk.name + '>');
          k += 2;
        } else if (t && t.t === 'tag' && t.close && t.name === tk.name) {
          line(open(tk, depth, columns) + '</' + tk.name + '>');
          k += 1;
        } else {
          line(open(tk, depth, columns));
          stack.push(tk.name);
          depth++;
        }
      }
    }
    if (stack.length) throw new Error('не закрыт <' + stack[stack.length - 1] + '>');
    var nl = newline(text);
    return lines.join(nl) + (/\n\s*$/.test(text) ? nl : '');

    function line(s) {
      lines.push(new Array(depth + 1).join(INDENT) + s.replace(/\r?\n/g, function () { return newline(text); }));
    }
  }

  // Открывающий тег; в столбик — первый атрибут в строке тега, остальные под ним
  function open(tk, depth, columns) {
    var attrs = tk.attrs.map(function (a) { return a.name + (a.value === null ? '' : '=' + a.value); });
    var end = tk.self ? ' />' : '>';
    if (!columns || attrs.length < 2) return '<' + tk.name + attrs.map(function (a) { return ' ' + a; }).join('') + end;
    var pad = '\n' + new Array(depth + 1).join(INDENT) + new Array(tk.name.length + 3).join(' ');
    return '<' + tk.name + ' ' + attrs.join(pad) + end;
  }

  // Правило на строку, объявления — по одному с отступом, между правилами верхнего уровня — пустая строка
  function formatCss(text) {
    var lines = [], depth = 0, cur = '', i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (text.startsWith('/*', i)) {
        var e = text.indexOf('*/', i + 2);
        if (e < 0) throw new Error('незакрытый комментарий');
        var com = text.slice(i, e + 2);
        if (cur.trim()) cur += com; else line(com);
        i = e + 2;
      } else if (c === '"' || c === "'") {
        var q = text.indexOf(c, i + 1);
        if (q < 0) throw new Error('незакрытая строка');
        cur += text.slice(i, q + 1);
        i = q + 1;
      } else if (c === '{') {
        line(clean(cur) + ' {');
        depth++;
        cur = '';
        i++;
      } else if (c === ';') {
        if (clean(cur)) line(decl(cur) + ';');
        cur = '';
        i++;
      } else if (c === '}') {
        if (!depth) throw new Error('лишняя «}»');
        if (clean(cur)) line(decl(cur) + ';');
        depth--;
        line('}');
        if (!depth) lines.push('');
        cur = '';
        i++;
      } else {
        cur += c;
        i++;
      }
    }
    if (depth) throw new Error('не хватает «}»');
    if (clean(cur)) line(clean(cur));
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    var nl = newline(text);
    return lines.join(nl) + (/\n\s*$/.test(text) ? nl : '');

    function line(s) {
      lines.push(new Array(depth + 1).join(INDENT) + s);
    }
  }

  // Пробелы внутри селектора/объявления (вне строк в кавычках) — в один пробел
  function clean(s) {
    return s.split(/("[^"]*"|'[^']*')/).map(function (p, k) { return k % 2 ? p : p.replace(/\s+/g, ' '); }).join('').trim();
  }

  // Объявление: «свойство:значение» → «свойство: значение»
  function decl(s) {
    s = clean(s);
    var m = /^([-\w]+)\s*:\s*([\s\S]*)$/.exec(s);
    return m ? m[1] + ': ' + m[2] : s;
  }

  function format(text, lang, columns) {
    if (lang === 'auto') lang = detect(text);
    return lang === 'css' ? formatCss(text) : formatXml(text, columns);
  }

  RIE.code = {
    detect: detect,
    highlight: highlight,
    format: format,
    formatXml: formatXml,
    formatCss: formatCss,
    tokens: xmlTokens
  };
})(window.RIE = window.RIE || {});
