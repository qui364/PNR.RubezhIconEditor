// Юнит-тесты js/xml.js: экранирование, стиль файла, сохранение пробелов, ошибки.
(function () {
  'use strict';

  var X = RIE.xml;

  function rt(src) {
    return X.write(X.parse(src));
  }

  // ---------- Экранирование ----------
  T.test('xml: decode — именованные и числовые сущности', function () {
    T.eq(X.decode('&lt;&gt;&amp;&quot;&apos;&#65;&#x42;&#x44f;'), '<>&"\'ABя');
    T.eq(X.decode('без сущностей'), 'без сущностей');
    T.eq(X.decode('&foo; &amp'), '&foo; &amp', 'неизвестное и незакрытое не трогаются');
    T.eq(X.decode('&amp;lt;'), '&lt;', 'без двойного декодирования');
  });

  T.test('xml: encodeText — только & < > (как XmlSerializer)', function () {
    T.eq(X.encodeText('a & b < c > d " \' \r\n'), 'a &amp; b &lt; c &gt; d " \' \r\n');
    T.eq(X.decode(X.encodeText('<&>"')), '<&>"');
  });

  T.test('xml: encodeAttr — плюс кавычка', function () {
    T.eq(X.encodeAttr('a"&<'), 'a&quot;&amp;&lt;');
  });

  // ---------- Round-trip стилей ----------
  T.test('xml: round-trip CRLF, пробел перед />', function () {
    var s = '<?xml version="1.0"?>\r\n<A>\r\n  <B>1</B>\r\n  <C />\r\n</A>';
    T.eq(rt(s), s);
  });

  T.test('xml: round-trip LF, encoding, без пробела перед />', function () {
    var s = "<?xml version='1.0' encoding='UTF-8'?>\n<A>\n  <B>1</B>\n  <C/>\n</A>\n";
    T.eq(rt(s), s);
  });

  T.test('xml: round-trip с BOM в начале строки', function () {
    var s = '﻿<?xml version="1.0" encoding="utf-8"?>\r\n<A><B>x</B></A>';
    T.eq(rt(s), s);
  });

  T.test('xml: пробелы между тегами сохраняются как есть', function () {
    var s = '<A>  \t<B>1</B>\r\n\r\n    <C>2</C>   </A>';
    T.eq(rt(s), s);
  });

  T.test('xml: сырой текст элемента не меняется (CRLF, LF, сущности)', function () {
    var s = '<A><B>строка 1\r\nстрока 2\nстрока 3 &lt;x&gt; &#xD; &amp;amp;</B></A>';
    var doc = X.parse(s);
    T.eq(doc.root.children[0].text, 'строка 1\r\nстрока 2\nстрока 3 &lt;x&gt; &#xD; &amp;amp;');
    T.eq(X.write(doc), s);
  });

  T.test('xml: атрибуты — кавычки и пробелы вокруг =', function () {
    var s = '<A x="1" y=\'2\' z = "a&amp;b"><B q="&quot;" /></A>';
    var doc = X.parse(s);
    T.eq(doc.root.attrs.length, 3);
    T.eq(doc.root.attrs[1].q, "'");
    T.eq(doc.root.attrs[2].raw, 'a&amp;b');
    // Пробелы вокруг = нормализуются; значения и кавычки — исходные
    T.eq(X.write(doc), '<A x="1" y=\'2\' z="a&amp;b"><B q="&quot;" /></A>');
  });

  T.test('xml: пустой элемент <B></B> остаётся парой тегов', function () {
    var s = '<A><B></B><C /></A>';
    var doc = X.parse(s);
    T.eq(doc.root.children[0].text, '');
    T.eq(doc.root.children[0].selfClosing, false);
    T.eq(doc.root.children[1].selfClosing, true);
    T.eq(X.write(doc), s);
  });

  T.test('xml: стиль файла — перевод строк из пролога', function () {
    T.eq(X.parse('<?xml version="1.0"?>\r\n<A />').newline, '\r\n');
    T.eq(X.parse('<?xml version="1.0"?>\n<A />').newline, '\n');
    T.eq(X.parse('<A />').newline, '\r\n', 'по умолчанию — CRLF');
  });

  T.test('xml: стиль файла — вид пустых тегов по первому', function () {
    T.eq(X.parse('<A><B /><C/></A>').closeSpace, true);
    T.eq(X.parse('<A><B/><C /></A>').closeSpace, false);
    T.eq(X.parse('<A><B>1</B></A>').closeSpace, true, 'по умолчанию — " />"');
  });

  // ---------- Новые элементы ----------
  T.test('xml: новые элементы — стандартный отступ и перевод строк файла', function () {
    var doc = X.parse('<?xml version="1.0"?>\n<A>\n  <B>1</B>\n</A>');
    var b = doc.root.children[0];
    b.children = [X.el('C', [], 'x'), X.el('D')];
    b.text = null;
    T.eq(X.write(doc), '<?xml version="1.0"?>\n<A>\n  <B>\n    <C>x</C>\n    <D />\n  </B>\n</A>');
  });

  T.test('xml: новый пустой элемент — в стиле файла "/>"', function () {
    var doc = X.parse('<A>\r\n  <B/>\r\n</A>');
    doc.root.children.push(X.el('C'));
    T.eq(X.write(doc), '<A>\r\n  <B/>\r\n  <C/>\r\n</A>');
  });

  T.test('xml: keepWs переносит исходные пробелы', function () {
    var doc = X.parse('<A>\t<B>\n<C>1</C> </B></A>');
    var orig = doc.root.children[0];
    var e = X.keepWs(X.el('B', [X.el('C', [], '2')]), orig);
    e.children[0].ws = orig.children[0].ws;
    doc.root.children[0] = e;
    T.eq(X.write(doc), '<A>\t<B>\n<C>2</C> </B></A>');
    T.eq(X.keepWs(X.el('Z'), null).ws, undefined, 'без исходного — без изменений');
  });

  // ---------- Ошибки ----------
  T.test('xml: ошибки разбора', function () {
    T.throws(function () { X.parse('<A><B></A>'); }, /Непарный закрывающий тег <\/A>/);
    T.throws(function () { X.parse('<A><B>'); }, /обрывается внутри <B>/);
    T.throws(function () { X.parse('текст<A/>'); }, /Текст вне корневого/);
    T.throws(function () { X.parse('<A>x<B/></A>'); }, /Смешанное содержимое в <A>/);
    T.throws(function () { X.parse('<A><B/>x</A>'); }, /Смешанное содержимое в <A>/);
    T.throws(function () { X.parse('<A><!-- c --></A>'); }, /Комментарии, CDATA/);
    T.throws(function () { X.parse('<A><![CDATA[x]]></A>'); }, /Комментарии, CDATA/);
    T.throws(function () { X.parse('<A/><B/>'); }, /Данные после корневого/);
    T.throws(function () { X.parse('<A></A>x'); }, /Данные после корневого/);
    T.throws(function () { X.parse(''); }, /Нет корневого/);
    T.throws(function () { X.parse('<A x=1/>'); }, /Некорректный тег/);
  });

  T.test('xml: в ошибке — номер строки', function () {
    var e = T.throws(function () { X.parse('<A>\r\n  <B>\r\n  </C>\r\n</A>'); });
    T.eq(e.name, 'XmlError');
    T.ok(/\(строка 3\)/.test(e.message), e.message);
  });

  T.test('xml: пробелы после корня допустимы и сохраняются', function () {
    T.eq(rt('<A />\r\n\r\n'), '<A />\r\n\r\n');
  });
})();
