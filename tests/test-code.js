// Тесты подсветки и форматирования кода (js/code.js).
(function () {
  'use strict';

  var C = RIE.code;

  // Текст подсветки без разметки — должен совпадать с исходным
  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent;
  }

  T.test('code: подсветка XML — классы и экранирование', function () {
    var h = C.highlight('<A x = "1&lt;" y=\'2\'>t &amp; <b/></A>', 'xml');
    T.ok(h.indexOf('<span class="hl-tag">A</span>') >= 0, h);
    T.ok(h.indexOf('<span class="hl-attr">x</span><span class="hl-punct"> = </span><span class="hl-value">"1&amp;lt;"</span>') >= 0, h);
    T.ok(h.indexOf('<span class="hl-meta">&amp;amp;</span>') >= 0, h);
    T.eq(plain(h), '<A x = "1&lt;" y=\'2\'>t &amp; <b/></A>');
  });

  T.test('code: подсветка терпит незаконченный текст', function () {
    ['<', '<A', '<A x', '<A x="1', '<A x=1 /', '<!--', '<?xml', '</', 'a < b', '<A "x">', '<A x="1">\n<B'].forEach(function (s) {
      T.eq(plain(C.highlight(s, 'xml')), s, s);
    });
    ['a {', 'a { b', 'a { b: c', '/* x', 'a { b: "x;', '}'].forEach(function (s) {
      T.eq(plain(C.highlight(s, 'css')), s, s);
    });
  });

  T.test('code: подсветка CSS — селектор, свойство, значение, @-правило', function () {
    var h = C.highlight('ext.gk-background { fill: #F00; }\n@keyframes x { 0% {fill: #FFF;} }', 'css');
    T.ok(h.indexOf('<span class="hl-tag">ext.gk-background </span>') >= 0, h);
    T.ok(h.indexOf('<span class="hl-attr"> fill</span><span class="hl-punct">:</span><span class="hl-value"> #F00</span>') >= 0, h);
    T.ok(h.indexOf('<span class="hl-meta">\n@keyframes x </span>') >= 0, h);
    T.ok(h.indexOf('<span class="hl-tag"> 0% </span>') >= 0, h);
  });

  T.test('code: detect — SVG или CSS', function () {
    T.eq(C.detect('  <svg/>'), 'xml');
    T.eq(C.detect('ext.gk-background {}'), 'css');
  });

  T.test('code: форматирование XAML', function () {
    var src = '<?xml version="1.0" encoding="utf-16"?>\n' +
      '<Canvas Width="500" Height="500" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">\n' +
      '<Rectangle Width="500" Fill ="#F00"/>\n' +
      '<TextBlock FontSize = "160">Ex</TextBlock><Path Fill="#000"><Path.Data><RectangleGeometry Rect="0,0,1,1" /></Path.Data></Path>\n' +
      '<!-- x -->\n</Canvas>\n';
    var body = '  <TextBlock FontSize="160">Ex</TextBlock>\n' +
      '  <Path Fill="#000">\n' +
      '    <Path.Data>\n' +
      '      <RectangleGeometry Rect="0,0,1,1" />\n' +
      '    </Path.Data>\n' +
      '  </Path>\n' +
      '  <!-- x -->\n' +
      '</Canvas>\n';
    T.eq(C.formatXml(src), '<?xml version="1.0" encoding="utf-16"?>\n' +
      '<Canvas Width="500" Height="500" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">\n' +
      '  <Rectangle Width="500" Fill="#F00" />\n' + body, 'без столбика');
    T.eq(C.formatXml(src, true), '<?xml version="1.0" encoding="utf-16"?>\n' +
      '<Canvas Width="500"\n' +
      '        Height="500"\n' +
      '        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"\n' +
      '        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">\n' +
      '  <Rectangle Width="500"\n' +
      '             Fill="#F00" />\n' + body, 'в столбик');
    T.eq(C.format(C.formatXml(src, true), 'xml'), C.formatXml(src), 'из столбика обратно в строку');
    T.eq(C.formatXml('<A>\r\n<B/></A>'), '<A>\r\n  <B />\r\n</A>', 'CRLF сохраняется');
  });

  T.test('code: форматирование XAML — ошибки', function () {
    T.throws(function () { C.formatXml('<A><B></A>'); }, /непарный/);
    T.throws(function () { C.formatXml('<A>'); }, /не закрыт <A>/);
    T.throws(function () { C.formatXml('<A x="1'); }, /незакрытый/);
    T.throws(function () { C.formatXml('<A x=1 />'); }, /без кавычек/);
    T.throws(function () { C.formatXml('<!-- x'); }, /комментарий/);
  });

  T.test('code: форматирование CSS', function () {
    var src = 'ext.gk-background {\n  fill-opacity: 1;\n  fill:#F00;\n  animation: example 1.8s infinite;\n  }\n  \n' +
      '  @keyframes example {\n    0% {fill: #FFF; animation-timing-function: steps(1, end);}\n    50% {fill: #F00}\n  }';
    T.eq(C.formatCss(src), 'ext.gk-background {\n  fill-opacity: 1;\n  fill: #F00;\n  animation: example 1.8s infinite;\n}\n\n' +
      '@keyframes example {\n  0% {\n    fill: #FFF;\n    animation-timing-function: steps(1, end);\n  }\n  50% {\n    fill: #F00;\n  }\n}');
    T.eq(C.formatCss('a:hover { content: "a  ;  b" }'), 'a:hover {\n  content: "a  ;  b";\n}', 'селектор и строки не трогаются');
    T.throws(function () { C.formatCss('a {'); }, /«}»/);
    T.throws(function () { C.formatCss('a }'); }, /«}»/);
  });

  // ---------- Все кадры и SvgImage примеров ----------
  T.perFile('code: подсветка и форматирование всех кадров и SvgImage', function (f, notes) {
    var lib = RIE.rlib.parse(f.text);
    var n = 0, bad = [], broken = [];
    lib.devices.forEach(function (d) {
      d.states.forEach(function (s) {
        var where = (d.name || d.driverUid) + ' / ' + s.stateClass;
        s.frames.forEach(function (fr, i) {
          n++;
          check(where + ' / кадр ' + (i + 1), fr.image, 'xml', function (a, b) {
            var ra = RIE.xaml.toSvg(a), rb = RIE.xaml.toSvg(b);
            return ra.svg === rb.svg && ra.error === rb.error;
          });
        });
        if (s.svgImage !== null) {
          n++;
          check(where + ' / SvgImage', s.svgImage, 'auto', null);
        }
      });
    });
    notes.push('· ' + f.name + ': текстов ' + n + (broken.length ? '; битый XML (форматирование отказывает): ' + broken.join('; ') : ''));
    if (bad.length) T.fail(bad.length + ' из ' + n + ':\n' + bad.slice(0, 10).join('\n'));

    // same(исходный, отформатированный) — рисунок не изменился
    function check(where, text, lang, same) {
      try {
        // Разбор HTML (как и textarea) приводит CRLF и CR к LF
        var hl = plain(C.highlight(text, lang)), nl = text.replace(/\r\n?/g, '\n');
        if (hl !== nl) {
          var k = 0;
          while (hl[k] === nl[k]) k++;
          return bad.push(where + ': подсветка искажает текст с позиции ' + k + ': ' + JSON.stringify(nl.slice(k, k + 40)) + ' → ' + JSON.stringify(hl.slice(k, k + 40)));
        }
        var out;
        try {
          out = C.format(text, lang);
        } catch (e) {
          // Некорректный XML в данных (атрибут без кавычек, непарный тег) отформатировать нельзя — это верно
          if (C.detect(text) === 'xml' && !wellFormed(text)) return broken.push(where);
          throw e;
        }
        if (C.format(out, lang) !== out) return bad.push(where + ': повторное форматирование меняет текст');
        if (same && !same(text, out)) return bad.push(where + ': после форматирования другой рисунок');
        var col = C.format(text, lang, true);
        if (C.format(col, lang, true) !== col) return bad.push(where + ': повторное форматирование в столбик меняет текст');
        if (C.format(col, lang) !== out) return bad.push(where + ': из столбика в строку — не тот же текст');
        if (same && !same(text, col)) bad.push(where + ': после форматирования в столбик другой рисунок');
      } catch (e) {
        bad.push(where + ': ' + e.message);
      }
    }

    function wellFormed(text) {
      var doc = new DOMParser().parseFromString(text.replace(/^\s*<\?xml[^>]*\?>/, ''), 'application/xml');
      return !doc.getElementsByTagName('parsererror').length;
    }
  });
})();
