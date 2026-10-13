// Тесты конвертера XAML → SVG (js/xaml.js).
(function () {
  'use strict';

  var HEAD = '<?xml version="1.0" encoding="utf-16"?>\n' +
    '<Canvas Width="500" Height="500" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">\n';

  function conv(body) {
    return RIE.xaml.toSvg(HEAD + body + '\n</Canvas>');
  }

  // SVG без ошибок разбора; возвращает корневой элемент
  function svgRoot(res) {
    T.ok(!res.error, 'ошибка: ' + res.error);
    var doc = new DOMParser().parseFromString(res.svg, 'image/svg+xml');
    var pe = doc.getElementsByTagName('parsererror')[0];
    if (pe) T.fail('некорректный SVG: ' + pe.textContent.replace(/\s+/g, ' ') + ' — ' + res.svg.slice(0, 300));
    return doc.documentElement;
  }

  function one(res, sel) {
    var e = svgRoot(res).querySelector(sel);
    T.ok(e, 'нет <' + sel + '> в ' + res.svg);
    return e;
  }

  // ---------- Цвета ----------
  T.test('xaml: color — форматы WPF', function () {
    var c = RIE.xaml.color;
    T.eq(c('#FC0'), '#FC0');
    T.eq(c('#FFCC00'), '#FFCC00');
    T.eq(c('#80FF0000'), 'rgba(255,0,0,0.502)');
    T.eq(c('#8F00'), 'rgba(255,0,0,0.533)', '#ARGB');
    T.eq(c(' Red '), 'red');
    T.eq(c('Transparent'), 'transparent');
    T.eq(c(''), null);
    T.eq(c(null), null);
    T.eq(c('#12'), null);
    T.eq(c('{StaticResource X}'), null);
  });

  // ---------- Фигуры ----------
  T.test('xaml: пустой Canvas — viewBox 500×500', function () {
    var res = conv('');
    var svg = svgRoot(res);
    T.eq(svg.getAttribute('viewBox'), '0 0 500 500');
    T.eq(res.width, 500);
    T.eq(res.warnings.length, 0);
    T.eq(svg.children.length, 0);
  });

  T.test('xaml: пробелы вокруг = и короткие цвета', function () {
    var e = one(conv('<Rectangle Width = "100" Height="50" Fill ="#F00" Stroke= "#0F0" StrokeThickness = "10" />'), 'rect');
    T.eq(e.getAttribute('fill'), '#F00');
    T.eq(e.getAttribute('stroke'), '#0F0');
    // Обводка — внутри границ, как в WPF
    T.eq(e.getAttribute('x'), '5');
    T.eq(e.getAttribute('width'), '90');
    T.eq(e.getAttribute('height'), '40');
  });

  T.test('xaml: Canvas.Left/Top и Canvas.Bottom/Right', function () {
    var res = conv('<Ellipse Canvas.Left="10" Canvas.Top="20" Width="100" Height="60" Fill="Red" />' +
      '<Rectangle Canvas.Right="10" Canvas.Bottom="20" Width="100" Height="50" Fill="Blue" />');
    var g = svgRoot(res).querySelectorAll('g');
    T.eq(g.length, 2);
    T.eq(g[0].getAttribute('transform'), 'translate(10 20)');
    T.eq(g[1].getAttribute('transform'), 'translate(390 430)');
    var el = g[0].querySelector('ellipse');
    T.eq(el.getAttribute('cx'), '50');
    T.eq(el.getAttribute('ry'), '30');
    T.eq(el.getAttribute('fill'), 'red');
  });

  T.test('xaml: Line, Polyline, Polygon', function () {
    var res = conv('<Line X1="0" Y1="0" X2="100" Y2="50" Stroke="#000" StrokeThickness="4" StrokeStartLineCap="Round" />' +
      '<Polyline Points="0,0 10,10 20,0" Stroke="#000" />' +
      '<Polygon Points="0 0, 10 10, 20 0" Fill="#00F" FillRule="Nonzero" />');
    var svg = svgRoot(res);
    var l = svg.querySelector('line');
    T.eq(l.getAttribute('x2'), '100');
    T.eq(l.getAttribute('stroke-width'), '4');
    T.eq(l.getAttribute('stroke-linecap'), 'round');
    var p = svg.querySelectorAll('path');
    T.eq(p[0].getAttribute('d'), 'M0,0 10,10 20,0');
    T.eq(p[0].getAttribute('fill'), 'none');
    T.eq(p[1].getAttribute('d'), 'M0,0 10,10 20,0 Z');
    T.eq(p[1].getAttribute('fill-rule'), 'nonzero');
  });

  T.test('xaml: Path — Data и FillRule из F1', function () {
    var p = one(conv('<Path Data="F1 M 0,0 L 100,0 L 100,100 Z" Fill="#000" />'), 'path');
    T.eq(p.getAttribute('d'), 'M 0,0 L 100,0 L 100,100 Z');
    T.eq(p.getAttribute('fill-rule'), 'nonzero');
    T.eq(one(conv('<Path Data="M0,0 L1,1" Stroke="#000" />'), 'path').getAttribute('fill-rule'), 'evenodd');
  });

  T.test('xaml: Path.Data — CombinedGeometry из Rectangle/EllipseGeometry', function () {
    var res = conv('<Path Fill="#F00"><Path.Data><CombinedGeometry GeometryCombineMode="Exclude">' +
      '<CombinedGeometry.Geometry1><RectangleGeometry Rect="0,0,100,100" /></CombinedGeometry.Geometry1>' +
      '<CombinedGeometry.Geometry2><EllipseGeometry Center="50,50" RadiusX="20" RadiusY="20" /></CombinedGeometry.Geometry2>' +
      '</CombinedGeometry></Path.Data></Path>');
    var p = one(res, 'path');
    T.ok(/^M0,0 h100 v100 h-100 Z M30,50 A20,20/.test(p.getAttribute('d')), p.getAttribute('d'));
    T.eq(p.getAttribute('fill-rule'), 'evenodd');
  });

  T.test('xaml: Stretch=Fill вписывает геометрию в Width×Height', function () {
    var p = one(conv('<Path Data="M0,0 L10,0 L10,10 Z" Width="100" Height="50" Stretch="Fill" Fill="#000" />'), 'path');
    T.eq(p.getAttribute('transform'), 'translate(0 0) scale(10 5)');
  });

  T.test('xaml: TextBlock — текст, размер, жирность, выравнивание', function () {
    var t = one(conv('<TextBlock Text="Ex &amp; 1" FontSize = "180" FontWeight="Bold" Foreground="#FFF" Width="500" TextAlignment="Center" />'), 'text');
    T.eq(t.textContent, 'Ex & 1');
    T.eq(t.getAttribute('font-size'), '180');
    T.eq(t.getAttribute('font-weight'), '700');
    T.eq(t.getAttribute('fill'), '#FFF');
    T.eq(t.getAttribute('text-anchor'), 'middle');
    T.eq(t.getAttribute('x'), '250');
    T.eq(one(conv('<TextBlock>  внутри\n текста </TextBlock>'), 'text').textContent, 'внутри текста');
  });

  T.test('xaml: Fill через property element SolidColorBrush', function () {
    var e = one(conv('<Rectangle Width="10" Height="10"><Rectangle.Fill><SolidColorBrush Color="#123456" /></Rectangle.Fill></Rectangle>'), 'rect');
    T.eq(e.getAttribute('fill'), '#123456');
  });

  T.test('xaml: Opacity и Visibility', function () {
    var svg = svgRoot(conv('<Rectangle Width="10" Height="10" Fill="Red" Opacity="0.5" /><Ellipse Width="10" Height="10" Fill="Red" Visibility="Collapsed" />'));
    T.eq(svg.querySelector('rect').getAttribute('opacity'), '0.5');
    T.eq(svg.querySelector('ellipse'), null);
  });

  T.test('xaml: вложенный Canvas с фоном', function () {
    var svg = svgRoot(conv('<Canvas Canvas.Left="100" Width="50" Height="50" Background="#0F0"><Rectangle Width="10" Height="10" Fill="Red" /></Canvas>'));
    var g = svg.querySelector('g');
    T.eq(g.getAttribute('transform'), 'translate(100 0)');
    T.eq(g.querySelectorAll('rect').length, 2);
    T.eq(g.querySelector('rect').getAttribute('fill'), '#0F0');
  });

  // ---------- Ошибки и заглушки ----------
  T.test('xaml: неподдерживаемый элемент — предупреждение, не ошибка', function () {
    var res = conv('<Image Source="x.png" /><Rectangle Width="10" Height="10" Fill="Red" />');
    svgRoot(res);
    T.eq(res.warnings.join(), 'Элемент <Image> не поддерживается');
    T.ok(res.svg.indexOf('<rect') >= 0, 'остальное рисуется');
  });

  T.test('xaml: ошибки — битый XML и пустой кадр', function () {
    var res = RIE.xaml.toSvg(HEAD + '<Rectangle Width="10"');
    T.ok(res.error, 'нет ошибки');
    T.eq(res.svg, undefined);
    T.eq(RIE.xaml.toSvg('').error, 'Пустой кадр');
    T.eq(RIE.xaml.toSvg('<?xml version="1.0" encoding="utf-16"?>\n  ').error, 'Пустой кадр');
  });

  // ---------- Все кадры примеров ----------
  T.perFile('xaml: все кадры конвертируются без ошибок', function (f, notes) {
    var lib = RIE.rlib.parse(f.text);
    var frames = 0, bad = [], warn = {};
    lib.devices.forEach(function (d) {
      d.states.forEach(function (s) {
        s.frames.forEach(function (fr, i) {
          frames++;
          var where = (d.name || d.driverUid) + ' / ' + s.stateClass + ' / кадр ' + (i + 1);
          try {
            var res = RIE.xaml.toSvg(fr.image);
            if (res.error) { bad.push(where + ': ' + res.error); return; }
            var doc = new DOMParser().parseFromString(res.svg, 'image/svg+xml');
            if (doc.getElementsByTagName('parsererror').length) bad.push(where + ': некорректный SVG');
            res.warnings.forEach(function (w) { warn[w] = (warn[w] || 0) + 1; });
          } catch (e) {
            bad.push(where + ': исключение ' + e.message);
          }
        });
      });
    });
    var w = Object.keys(warn).map(function (k) { return k + ' ×' + warn[k]; });
    notes.push('· ' + f.name + ': кадров ' + frames + (w.length ? '; предупреждения: ' + w.join('; ') : ''));
    T.ok(frames > 0, 'нет кадров');
    if (bad.length) T.fail(bad.length + ' из ' + frames + ':\n' + bad.slice(0, 10).join('\n'));
  });
})();
