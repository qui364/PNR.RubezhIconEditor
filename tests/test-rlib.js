// Тесты модели .rlib (js/rlib.js): round-trip байт-в-байт и round-trip после правок.
(function () {
  'use strict';

  var R = RIE.rlib, X = RIE.xml;

  function lines(a) { return a.join('\r\n'); }

  // Маленькая библиотека в стиле XmlSerializer; неизвестные элементы — в конце родителей
  var SYN = lines([
    '<?xml version="1.0"?>',
    '<GKDeviceLibraryConfiguration xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <Version>',
    '    <MajorVersion>1</MajorVersion>',
    '    <MinorVersion>1</MinorVersion>',
    '  </Version>',
    '  <GKDevices>',
    '    <GKLibraryDevice>',
    '      <UID>11111111-1111-1111-1111-111111111111</UID>',
    '      <DriverUID>22222222-2222-2222-2222-222222222222</DriverUID>',
    '      <States>',
    '        <GKLibraryState>',
    '          <StateClass>Fire1</StateClass>',
    '          <Frames>',
    '            <GKLibraryFrame>',
    '              <Id>0</Id>',
    '              <Duration>300</Duration>',
    '              <Image>&lt;Canvas /&gt;\nстрока &amp;amp;</Image>',
    '              <FrameX a="1" />',
    '            </GKLibraryFrame>',
    '            <GKLibraryFrame>',
    '              <Id>0</Id>',
    '              <Duration>200</Duration>',
    '              <Image />',
    '            </GKLibraryFrame>',
    '            <FramesX>f</FramesX>',
    '          </Frames>',
    '          <SvgImage>ext.gk-background { fill: red; }</SvgImage>',
    '          <Layer>0</Layer>',
    '          <StateX>s</StateX>',
    '        </GKLibraryState>',
    '        <GKLibraryState>',
    '          <StateClass>No</StateClass>',
    '          <Frames />',
    '          <Layer>0</Layer>',
    '        </GKLibraryState>',
    '      </States>',
    '      <DeviceX>d</DeviceX>',
    '    </GKLibraryDevice>',
    '  </GKDevices>',
    '  <RootX>r</RootX>',
    '</GKDeviceLibraryConfiguration>'
  ]);

  // ---------- Синтетика ----------
  T.test('rlib: синтетика — round-trip и чтение полей', function () {
    var lib = R.parse(SYN);
    T.eq(R.serialize(lib), SYN);
    T.eq(lib.devices.length, 1);
    var d = lib.devices[0];
    T.eq(d.name, null);
    T.eq(d.states.length, 2);
    var s = d.states[0];
    T.eq(s.stateClass, 'Fire1');
    T.eq(s.svgImage, 'ext.gk-background { fill: red; }');
    T.eq(s.frames.length, 2);
    T.eq(s.frames[0].duration, 300);
    T.eq(s.frames[0].image, '<Canvas />\nстрока &amp;', 'Image декодируется один раз');
    T.eq(s.frames[1].image, '');
    T.eq(d.states[1].svgImage, null);
    T.eq(d.states[1].frames.length, 0);
  });

  T.test('rlib: неизвестные элементы сохраняются после правок', function () {
    var lib = R.parse(SYN);
    lib.devices[0].states[0].frames[0].duration = 999;
    lib.devices[0].name = 'Новое имя';
    var out = R.serialize(lib);
    ['<FrameX a="1" />', '<FramesX>f</FramesX>', '<StateX>s</StateX>', '<DeviceX>d</DeviceX>', '<RootX>r</RootX>']
      .forEach(function (t) { T.ok(out.indexOf(t) >= 0, 'потерян ' + t); });
    T.ok(out.indexOf('<Duration>999</Duration>') >= 0);
    // Name — между DriverUID и States, как в схеме
    T.ok(/<\/DriverUID>\r\n      <Name>Новое имя<\/Name>\r\n      <States>/.test(out), 'место Name');
    T.eq(R.serialize(R.parse(out)), out, 'повторный round-trip');
  });

  T.test('rlib: неизвестный элемент в середине пишется после известных', function () {
    var src = SYN.replace('      <States>', '      <Mid>m</Mid>\r\n      <States>');
    var lib = R.parse(src);
    var out = R.serialize(lib);
    T.ok(out.indexOf('<Mid>m</Mid>') > out.indexOf('</States>'), 'Mid после States');
    T.eq(R.parse(out).devices[0].states.length, 2);
  });

  T.test('rlib: Id кадров не перенумеровываются, порядок состояний сохраняется', function () {
    var lib = R.parse(SYN);
    var st = lib.devices[0].states;
    st.reverse();
    st[1].frames.reverse();
    var lib2 = R.parse(R.serialize(lib));
    var st2 = lib2.devices[0].states;
    T.eq(st2.map(function (s) { return s.stateClass; }).join(','), 'No,Fire1');
    T.eq(st2[1].frames.map(function (f) { return f.id + ':' + f.duration; }).join(','), '0:200,0:300');
  });

  T.test('rlib: нецелый Id кадра («1,1») сохраняется как есть', function () {
    var src = SYN.replace('<Id>0</Id>', '<Id>1,1</Id>');
    var lib = R.parse(src);
    var f = lib.devices[0].states[0].frames;
    T.eq(f[0].id, 1);
    T.eq(R.serialize(lib), src, 'без правок');
    f[0].duration = 1;
    T.ok(R.serialize(lib).indexOf('<Id>1,1</Id>') >= 0, 'после правки кадра');
    lib.devices.push(R.cloneDevice(lib.devices[0]));
    T.eq(R.serialize(lib).split('<Id>1,1</Id>').length - 1, 2, 'в копии устройства');
    f[0].id = 5;
    T.ok(R.serialize(lib).indexOf('<Id>5</Id>') >= 0, 'новое число');
  });

  T.test('rlib: нестандартный Duration («0300») сохраняется как есть', function () {
    var src = SYN.replace('<Duration>300</Duration>', '<Duration>0300</Duration>');
    var lib = R.parse(src);
    var f = lib.devices[0].states[0].frames;
    T.eq(f[0].duration, 300);
    T.eq(R.serialize(lib), src, 'без правок');
    f[0].image = 'x';
    T.ok(R.serialize(lib).indexOf('<Duration>0300</Duration>') >= 0, 'после правки кадра');
    f[0].duration = 400;
    T.ok(R.serialize(lib).indexOf('<Duration>400</Duration>') >= 0, 'новое число');
  });

  T.test('rlib: экранирование изменённого текста', function () {
    var lib = R.parse(SYN);
    var img = '<?xml version="1.0" encoding="utf-16"?>\n<Canvas a="&amp;"> & < > " \' \r\n</Canvas>';
    lib.devices[0].states[0].frames[1].image = img;
    lib.devices[0].name = 'A & B <C>';
    var out = R.serialize(lib);
    T.ok(out.indexOf('<Name>A &amp; B &lt;C&gt;</Name>') >= 0, 'Name экранирован');
    var lib2 = R.parse(out);
    T.eq(lib2.devices[0].states[0].frames[1].image, img);
    T.eq(lib2.devices[0].name, 'A & B <C>');
  });

  T.test('rlib: пустой текст — пустой тег в стиле файла', function () {
    var lib = R.parse(SYN.replace(/ \/>/g, '/>'));
    lib.devices[0].states[0].svgImage = '';
    lib.devices[0].states[0].frames[1].image = 'x';
    lib.devices[0].states[0].frames[0].image = '';
    var out = R.serialize(lib);
    T.ok(out.indexOf('<SvgImage/>') >= 0, 'SvgImage');
    T.ok(out.indexOf('<Image/>') >= 0 && out.indexOf('<Image>x</Image>') >= 0, 'Image');
    T.ok(out.indexOf(' />') < 0, 'нет " />"');
  });

  T.test('rlib: новое состояние и кадр', function () {
    var lib = R.parse(SYN);
    var d = lib.devices[0];
    var s = R.newState('Info');
    d.states.push(s);
    var s2 = R.newState('Test');
    s2.frames.push(R.newFrame(1, 250, R.EMPTY_CANVAS));
    d.states.push(s2);
    var out = R.serialize(lib);
    T.ok(out.indexOf(lines([
      '        <GKLibraryState>',
      '          <StateClass>Info</StateClass>',
      '          <Frames />',
      '          <Layer>0</Layer>',
      '        </GKLibraryState>'
    ])) >= 0, 'новое пустое состояние');
    var lib2 = R.parse(out);
    var t = lib2.devices[0].states[3];
    T.eq(t.stateClass, 'Test');
    T.eq(t.frames.length, 1);
    T.eq(t.frames[0].id, 1);
    T.eq(t.frames[0].duration, 250);
    T.eq(t.frames[0].image, R.EMPTY_CANVAS);
    T.eq(R.serialize(lib2), out);
  });

  T.test('rlib: удаление всех кадров — <Frames />', function () {
    var lib = R.parse(SYN.replace('            <FramesX>f</FramesX>\r\n', ''));
    lib.devices[0].states[0].frames = [];
    var out = R.serialize(lib);
    T.ok(/<StateClass>Fire1<\/StateClass>\r\n {10}<Frames \/>\r\n {10}<SvgImage>/.test(out), 'пустые Frames');
    T.eq(R.parse(out).devices[0].states[0].frames.length, 0);
    // Нераспознанное внутри Frames остаётся и без кадров
    lib = R.parse(SYN);
    lib.devices[0].states[0].frames = [];
    T.ok(/<Frames>\r\n {12}<FramesX>f<\/FramesX>\r\n {10}<\/Frames>/.test(R.serialize(lib)), 'FramesX');
  });

  T.test('rlib: копия устройства — новый UID, общий исходный текст', function () {
    var lib = R.parse(SYN);
    var c = R.cloneDevice(lib.devices[0]);
    T.ok(c.uid !== lib.devices[0].uid);
    T.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.uid), c.uid);
    T.ok(c.key !== lib.devices[0].key && c.states[0].key !== lib.devices[0].states[0].key, 'новые key');
    c.states[0].frames[0].duration = 1;
    T.eq(lib.devices[0].states[0].frames[0].duration, 300, 'кадры копии независимы');
    lib.devices.push(c);
    var lib2 = R.parse(R.serialize(lib));
    T.eq(lib2.devices.length, 2);
    T.eq(lib2.devices[1].uid, c.uid);
    T.eq(lib2.devices[1].states[0].frames[0].duration, 1);
    T.eq(lib2.devices[1].states[0].frames[0].image, lib.devices[0].states[0].frames[0].image);
  });

  T.test('rlib: ошибки — не библиотека, нет GKDevices', function () {
    T.throws(function () { R.parse('<?xml version="1.0"?>\r\n<Foo />'); }, /корневой элемент <Foo>/);
    T.throws(function () { R.parse('<GKDeviceLibraryConfiguration><Version /></GKDeviceLibraryConfiguration>'); }, /нет раздела GKDevices/);
  });

  // ---------- Примеры ----------
  function context(s, i) {
    return JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  }

  function emptyFramesCount(text) {
    return (text.match(/<Frames ?\/>/g) || []).length;
  }

  T.perFile('rlib: round-trip байт-в-байт', function (f) {
    var out = T.encodeFile(R.serialize(R.parse(f.text)), f.bom);
    var i = T.diffAt(out, f.bytes);
    if (i >= 0) {
      var t = R.serialize(R.parse(f.text)), j = T.diffAt(t, f.text);
      T.fail('расхождение с байта ' + i + ' (размер ' + out.length + ' / ' + f.bytes.length + '); текст: ' +
        context(t, j) + ' вместо ' + context(f.text, j));
    }
  });

  T.perFile('rlib: data/default-rlib.js совпадает с examples/Default.rlib', function (f) {
    if (f.name !== 'Default.rlib') return;
    var bin = atob(RIE.defaultRlib);
    T.eq(bin.length, f.bytes.length, 'размер');
    for (var i = 0; i < bin.length; i++) if (bin.charCodeAt(i) !== f.bytes[i]) T.fail('расхождение с байта ' + i);
  });

  function findFramed(lib) {
    for (var i = 0; i < lib.devices.length; i++) {
      var st = lib.devices[i].states;
      for (var j = 0; j < st.length; j++) if (st[j].frames.length) return { d: i, s: j };
    }
    T.fail('нет состояний с кадрами');
  }

  T.perFile('rlib: правка Duration меняет только это число', function (f) {
    var lib = R.parse(f.text);
    var at = findFramed(lib);
    var fr = lib.devices[at.d].states[at.s].frames[0];
    var dur = fr.duration === 777 ? 778 : 777;
    fr.duration = dur;
    var out = R.serialize(lib);
    var g = T.diffRegion(f.text, out);
    T.ok(g, 'файл не изменился');
    T.ok(/^\d*$/.test(f.text.slice(g.start, g.endA)) && /^\d*$/.test(out.slice(g.start, g.endB)),
      'изменилось не только число: ' + context(out, g.start));
    T.ok(/<Duration>\d*$/.test(out.slice(g.start - 20, g.start)), 'изменилось не в Duration: ' + context(out, g.start));
    T.eq(R.parse(out).devices[at.d].states[at.s].frames[0].duration, dur);
  });

  T.perFile('rlib: набор правок — перечитывается, повторный round-trip без изменений', function (f) {
    var lib = R.parse(f.text);
    var n = lib.devices.length;
    var at = findFramed(lib);
    var d = lib.devices[at.d];
    var st = d.states[at.s];
    var ids = st.frames.map(function (x) { return x.id; });
    var maxId = Math.max.apply(null, ids);

    // Кадр: новый в конец, у первого — спецсимволы в XAML
    st.frames.push(R.newFrame(maxId + 1, 123, R.EMPTY_CANVAS));
    var img = st.frames[0].image + '\n<!-- & < > " -->';
    st.frames[0].image = img;
    // Состояние: новое пустое; у другого состояния с кадрами — удалить кадры
    d.states.push(R.newState('Info'));
    var emptied = null;
    lib.devices.some(function (dv, i) {
      return dv.states.some(function (s, j) {
        if (s !== st && s.frames.length) { s.frames = []; emptied = { d: i, s: j }; return true; }
      });
    });
    // Устройства: копия первого — в конец, последнее (если не правилось) — удалить
    var copy = R.cloneDevice(lib.devices[0]);
    var lastI = lib.devices.length - 1;
    var removed = lastI !== at.d && (!emptied || lastI !== emptied.d) ? lib.devices.pop() : null;
    lib.devices.push(copy);
    n += removed ? 0 : 1;

    var out = R.serialize(lib);
    var lib2 = R.parse(out);
    T.eq(R.serialize(lib2), out, 'повторный round-trip');
    T.eq(lib2.devices.length, n);
    T.eq(lib2.devices[n - 1].uid, copy.uid);
    var st2 = lib2.devices[at.d].states[at.s];
    T.eq(st2.frames.map(function (x) { return x.id; }).join(','), ids.concat(maxId + 1).join(','), 'Id кадров');
    T.eq(st2.frames[st2.frames.length - 1].duration, 123);
    T.eq(st2.frames[st2.frames.length - 1].image, R.EMPTY_CANVAS);
    T.eq(st2.frames[0].image, img);
    var last = lib2.devices[at.d].states[lib2.devices[at.d].states.length - 1];
    T.eq(last.stateClass, 'Info');
    T.eq(last.layer, '0');
    if (emptied) T.eq(lib2.devices[emptied.d].states[emptied.s].frames.length, 0);

    // Пустые Frames — в стиле файла: два новых (Info и опустошённое) плюс копии из клона
    var style = lib._o.doc.closeSpace ? '<Frames />' : '<Frames/>';
    function empties(dv) { return dv ? dv.states.filter(function (s) { return !s.frames.length; }).length : 0; }
    var copyEmpty = empties(copy);
    var removedEmpty = empties(removed);
    T.eq(emptyFramesCount(out), emptyFramesCount(f.text) + 1 + (emptied ? 1 : 0) + copyEmpty - removedEmpty, 'число пустых Frames');
    T.eq(out.split(style).length - 1, emptyFramesCount(out), 'вид пустых Frames');
  });
})();
