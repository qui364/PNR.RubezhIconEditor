// Конвертер XAML-кадров (подмножество WPF) в SVG для превью.
// Поддерживается: Canvas, Rectangle, Ellipse, Line, Polyline, Polygon, Path (+ Path.Data с
// геометриями), TextBlock. Неподдерживаемое пропускается с предупреждением.
(function (RIE) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = "'Segoe UI', Arial, sans-serif";
  var WEIGHTS = {
    thin: 100, extralight: 200, ultralight: 200, light: 300, normal: 400, regular: 400,
    medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800,
    black: 900, heavy: 900, extrablack: 950, ultrablack: 950
  };
  var CAPS = { flat: 'butt', round: 'round', square: 'square', triangle: 'round' };
  var JOINS = { miter: 'miter', bevel: 'bevel', round: 'round' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function num(v, def) {
    if (v === null || v === undefined || v === '' || /^auto$/i.test(v)) return def;
    var n = parseFloat(v);
    return isFinite(n) ? n : def;
  }

  function r(n) {
    return Math.round(n * 1000) / 1000;
  }

  function numbers(s) {
    return (s || '').split(/[\s,]+/).filter(Boolean).map(Number);
  }

  // WPF: #RGB, #ARGB, #RRGGBB, #AARRGGBB, именованные цвета
  function color(v) {
    if (!v) return null;
    v = v.trim();
    if (v[0] !== '#') return /^[a-z]+$/i.test(v) ? v.toLowerCase() : null;
    var h = v.slice(1);
    if (h.length === 3 || h.length === 6) return '#' + h;
    if (h.length === 4) h = h.replace(/./g, '$&$&');
    if (h.length !== 8) return null;
    var a = parseInt(h.slice(0, 2), 16) / 255;
    return 'rgba(' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' +
      parseInt(h.slice(6, 8), 16) + ',' + r(a) + ')';
  }

  // Значение свойства: атрибут или property element <Type.Prop><SolidColorBrush Color=".."/></Type.Prop>
  function prop(el, name) {
    if (el.hasAttribute(name)) return el.getAttribute(name);
    var pe = propEl(el, name);
    if (!pe) return null;
    var b = pe.firstElementChild;
    if (b && b.localName === 'SolidColorBrush') return b.getAttribute('Color');
    return null;
  }

  function propEl(el, name) {
    var full = el.localName + '.' + name;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === full) return c;
    }
    return null;
  }

  function shapeStyle(el, ctx, filled) {
    var a = [];
    var stroke = color(prop(el, 'Stroke'));
    var sw = stroke ? num(el.getAttribute('StrokeThickness'), 1) : 0;
    var fill = filled ? color(prop(el, 'Fill')) : null;
    a.push('fill="' + esc(fill || 'none') + '"');
    if (stroke && sw > 0) {
      a.push('stroke="' + esc(stroke) + '"', 'stroke-width="' + r(sw) + '"');
      var cap = CAPS[(el.getAttribute('StrokeStartLineCap') || el.getAttribute('StrokeEndLineCap') || '').toLowerCase()];
      if (cap) a.push('stroke-linecap="' + cap + '"');
      var join = JOINS[(el.getAttribute('StrokeLineJoin') || '').toLowerCase()];
      if (join) a.push('stroke-linejoin="' + join + '"');
      a.push('stroke-miterlimit="' + r(num(el.getAttribute('StrokeMiterLimit'), 10)) + '"');
      var dash = numbers(el.getAttribute('StrokeDashArray'));
      if (dash.length) a.push('stroke-dasharray="' + dash.map(function (d) { return r(d * sw); }).join(' ') + '"');
      var off = num(el.getAttribute('StrokeDashOffset'), 0);
      if (off) a.push('stroke-dashoffset="' + r(off * sw) + '"');
    }
    var op = el.getAttribute('Opacity');
    if (op !== null) a.push('opacity="' + r(num(op, 1)) + '"');
    return { attrs: a.join(' '), sw: sw };
  }

  // Позиция элемента на Canvas
  function position(el, parentW, parentH, w, h) {
    var x = num(el.getAttribute('Canvas.Left'), null);
    var y = num(el.getAttribute('Canvas.Top'), null);
    if (x === null) {
      var right = num(el.getAttribute('Canvas.Right'), null);
      x = right === null ? 0 : parentW - right - (w || 0);
    }
    if (y === null) {
      var bottom = num(el.getAttribute('Canvas.Bottom'), null);
      y = bottom === null ? 0 : parentH - bottom - (h || 0);
    }
    return { x: x, y: y };
  }

  function wrap(pos, inner) {
    if (!inner) return '';
    if (!pos.x && !pos.y) return inner;
    return '<g transform="translate(' + r(pos.x) + ' ' + r(pos.y) + ')">' + inner + '</g>';
  }

  // Bounding box геометрии через скрытый SVG (нужен для Stretch)
  var bboxSvg = null;
  function pathBBox(d) {
    if (!bboxSvg) {
      bboxSvg = document.createElementNS(SVG_NS, 'svg');
      bboxSvg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden');
      bboxSvg.appendChild(document.createElementNS(SVG_NS, 'path'));
      document.body.appendChild(bboxSvg);
    }
    var p = bboxSvg.firstChild;
    p.setAttribute('d', d);
    try {
      var b = p.getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    } catch (e) {
      return null;
    }
  }

  // Stretch=Fill/Uniform: геометрия вписывается в Width×Height минус толщина обводки
  function stretchTransform(el, bb, sw, w, h) {
    var mode = (el.getAttribute('Stretch') || 'None').toLowerCase();
    if (mode === 'none' || !bb || w === null || h === null) return '';
    var iw = Math.max(0, w - sw), ih = Math.max(0, h - sw);
    var sx = bb.w > 0 ? iw / bb.w : 1;
    var sy = bb.h > 0 ? ih / bb.h : 1;
    if (mode === 'uniform') sx = sy = Math.min(bb.w > 0 ? sx : sy, bb.h > 0 ? sy : sx);
    else if (mode === 'uniformtofill') sx = sy = Math.max(sx, sy);
    var tx = bb.w > 0 ? sw / 2 + (iw - bb.w * sx) / 2 - bb.x * sx : w / 2 - bb.x;
    var ty = bb.h > 0 ? sw / 2 + (ih - bb.h * sy) / 2 - bb.y * sy : h / 2 - bb.y;
    return ' transform="translate(' + r(tx) + ' ' + r(ty) + ') scale(' + r(sx) + ' ' + r(sy) + ')"';
  }

  // ---------- Геометрии ----------
  function pathData(s) {
    s = (s || '').trim();
    var rule = 'evenodd';
    var m = /^F\s*([01])\s*/i.exec(s);
    if (m) {
      rule = m[1] === '1' ? 'nonzero' : 'evenodd';
      s = s.slice(m[0].length);
    }
    return { d: s, rule: rule };
  }

  function ellipseD(cx, cy, rx, ry) {
    return 'M' + r(cx - rx) + ',' + r(cy) + ' A' + r(rx) + ',' + r(ry) + ' 0 1,0 ' + r(cx + rx) + ',' + r(cy) +
      ' A' + r(rx) + ',' + r(ry) + ' 0 1,0 ' + r(cx - rx) + ',' + r(cy) + ' Z';
  }

  function rectD(x, y, w, h, rx, ry) {
    if (!rx || !ry) return 'M' + r(x) + ',' + r(y) + ' h' + r(w) + ' v' + r(h) + ' h' + r(-w) + ' Z';
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    var a = ' A' + r(rx) + ',' + r(ry) + ' 0 0,1 ';
    return 'M' + r(x + rx) + ',' + r(y) + ' H' + r(x + w - rx) + a + r(x + w) + ',' + r(y + ry) +
      ' V' + r(y + h - ry) + a + r(x + w - rx) + ',' + r(y + h) + ' H' + r(x + rx) + a + r(x) + ',' + r(y + h - ry) +
      ' V' + r(y + ry) + a + r(x + rx) + ',' + r(y) + ' Z';
  }

  // Возвращает { d, rule } или null
  function geometry(g, ctx) {
    if (!g) return null;
    switch (g.localName) {
      case 'EllipseGeometry': {
        var c = numbers(g.getAttribute('Center'));
        return { d: ellipseD(c[0] || 0, c[1] || 0, num(g.getAttribute('RadiusX'), 0), num(g.getAttribute('RadiusY'), 0)), rule: 'evenodd' };
      }
      case 'RectangleGeometry': {
        var rc = numbers(g.getAttribute('Rect'));
        return { d: rectD(rc[0] || 0, rc[1] || 0, rc[2] || 0, rc[3] || 0, num(g.getAttribute('RadiusX'), 0), num(g.getAttribute('RadiusY'), 0)), rule: 'evenodd' };
      }
      case 'LineGeometry': {
        var p0 = numbers(g.getAttribute('StartPoint')), p1 = numbers(g.getAttribute('EndPoint'));
        return { d: 'M' + p0.join(',') + ' L' + p1.join(','), rule: 'evenodd' };
      }
      case 'PathGeometry': {
        if (g.hasAttribute('Figures')) {
          var pd = pathData(g.getAttribute('Figures'));
          if ((g.getAttribute('FillRule') || '').toLowerCase() === 'nonzero') pd.rule = 'nonzero';
          return pd;
        }
        ctx.warn('PathGeometry без атрибута Figures не поддерживается');
        return null;
      }
      case 'GeometryGroup': {
        var parts = [];
        for (var ch = g.firstElementChild; ch; ch = ch.nextElementSibling) {
          var x = geometry(ch, ctx);
          if (x) parts.push(x.d);
        }
        return { d: parts.join(' '), rule: (g.getAttribute('FillRule') || '').toLowerCase() === 'nonzero' ? 'nonzero' : 'evenodd' };
      }
      case 'CombinedGeometry': {
        // Приближение: обе геометрии одним путём. Exclude/Xor — через evenodd
        // (точно, когда вторая фигура лежит внутри первой), Union — nonzero.
        var g1 = geometry(firstChildOf(propEl(g, 'Geometry1')), ctx);
        var g2 = geometry(firstChildOf(propEl(g, 'Geometry2')), ctx);
        var mode = (g.getAttribute('GeometryCombineMode') || 'Union').toLowerCase();
        if (mode === 'intersect') ctx.warn('CombinedGeometry Intersect показывается приближённо');
        return {
          d: [g1 && g1.d, g2 && g2.d].filter(Boolean).join(' '),
          rule: mode === 'union' ? 'nonzero' : 'evenodd'
        };
      }
      default:
        ctx.warn('Геометрия <' + g.localName + '> не поддерживается');
        return null;
    }
  }

  function firstChildOf(el) {
    return el ? el.firstElementChild : null;
  }

  // ---------- Элементы ----------
  function renderChildren(parent, ctx, w, h) {
    var out = '';
    for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName.indexOf('.') >= 0) continue; // property element
      out += renderEl(c, ctx, w, h);
    }
    return out;
  }

  function renderEl(el, ctx, pw, ph) {
    var vis = (el.getAttribute('Visibility') || '').toLowerCase();
    if (vis === 'hidden' || vis === 'collapsed') return '';
    var w = num(el.getAttribute('Width'), null);
    var h = num(el.getAttribute('Height'), null);
    var pos = position(el, pw, ph, w, h);
    var st, sw;

    switch (el.localName) {
      case 'Canvas': {
        var bg = color(prop(el, 'Background'));
        var inner = (bg && w && h ? '<rect width="' + r(w) + '" height="' + r(h) + '" fill="' + esc(bg) + '"/>' : '') +
          renderChildren(el, ctx, w || 0, h || 0);
        var op = el.getAttribute('Opacity');
        if (op !== null) inner = '<g opacity="' + r(num(op, 1)) + '">' + inner + '</g>';
        return wrap(pos, inner);
      }
      case 'Rectangle': {
        if (!w || !h) return '';
        st = shapeStyle(el, ctx, true);
        sw = Math.min(st.sw, w, h);
        var rx = num(el.getAttribute('RadiusX'), 0), ry = num(el.getAttribute('RadiusY'), 0);
        // WPF рисует обводку внутри границ фигуры
        return wrap(pos, '<rect x="' + r(sw / 2) + '" y="' + r(sw / 2) + '" width="' + r(w - sw) + '" height="' + r(h - sw) + '"' +
          (rx || ry ? ' rx="' + r(Math.max(0, rx - sw / 2)) + '" ry="' + r(Math.max(0, ry - sw / 2)) + '"' : '') + ' ' + st.attrs + '/>');
      }
      case 'Ellipse': {
        if (!w || !h) return '';
        st = shapeStyle(el, ctx, true);
        sw = Math.min(st.sw, w, h);
        return wrap(pos, '<ellipse cx="' + r(w / 2) + '" cy="' + r(h / 2) + '" rx="' + r((w - sw) / 2) + '" ry="' + r((h - sw) / 2) + '" ' + st.attrs + '/>');
      }
      case 'Line': {
        st = shapeStyle(el, ctx, false);
        return wrap(pos, '<line x1="' + r(num(el.getAttribute('X1'), 0)) + '" y1="' + r(num(el.getAttribute('Y1'), 0)) +
          '" x2="' + r(num(el.getAttribute('X2'), 0)) + '" y2="' + r(num(el.getAttribute('Y2'), 0)) + '" ' + st.attrs + '/>');
      }
      case 'Polyline':
      case 'Polygon': {
        var pts = numbers(el.getAttribute('Points'));
        if (pts.length < 4) return '';
        var closed = el.localName === 'Polygon';
        st = shapeStyle(el, ctx, true);
        var rule = (el.getAttribute('FillRule') || '').toLowerCase() === 'nonzero' ? 'nonzero' : 'evenodd';
        var d = 'M';
        for (var i = 0; i + 1 < pts.length; i += 2) d += (i ? ' ' : '') + pts[i] + ',' + pts[i + 1];
        if (closed) d += ' Z';
        var tr = el.hasAttribute('Stretch') ? stretchTransform(el, pointsBBox(pts), st.sw, w, h) : '';
        return wrap(pos, '<path d="' + esc(d) + '" fill-rule="' + rule + '"' + tr + ' ' + st.attrs + '/>');
      }
      case 'Path': {
        var g;
        if (el.hasAttribute('Data')) g = pathData(el.getAttribute('Data'));
        else g = geometry(firstChildOf(propEl(el, 'Data')), ctx);
        if (!g || !g.d) return '';
        st = shapeStyle(el, ctx, true);
        var t = el.hasAttribute('Stretch') ? stretchTransform(el, pathBBox(g.d), st.sw, w, h) : '';
        return wrap(pos, '<path d="' + esc(g.d) + '" fill-rule="' + g.rule + '"' + t + ' ' + st.attrs + '/>');
      }
      case 'TextBlock':
        return wrap(pos, textBlock(el, w));
      default:
        ctx.warn('Элемент <' + el.localName + '> не поддерживается');
        return '';
    }
  }

  function pointsBBox(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i + 1 < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function textBlock(el, w) {
    var text = el.hasAttribute('Text') ? el.getAttribute('Text') : el.textContent;
    text = (text || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    var size = num(el.getAttribute('FontSize'), 12);
    var weight = WEIGHTS[(el.getAttribute('FontWeight') || 'normal').toLowerCase()] || 400;
    var fill = color(prop(el, 'Foreground')) || '#000';
    var family = el.getAttribute('FontFamily');
    var align = (el.getAttribute('TextAlignment') || 'Left').toLowerCase();
    var x = 0, anchor = 'start';
    if (w !== null && align === 'center') { x = w / 2; anchor = 'middle'; }
    else if (w !== null && align === 'right') { x = w; anchor = 'end'; }
    var a = [
      'x="' + r(x) + '"', 'y="' + r(size * 1.07) + '"', // базовая линия Segoe UI
      'font-family="' + esc(family ? family + ', ' + FONT : FONT) + '"',
      'font-size="' + r(size) + '"', 'fill="' + esc(fill) + '"'
    ];
    if (weight !== 400) a.push('font-weight="' + weight + '"');
    if ((el.getAttribute('FontStyle') || '').toLowerCase() === 'italic') a.push('font-style="italic"');
    if (anchor !== 'start') a.push('text-anchor="' + anchor + '"');
    var op = el.getAttribute('Opacity');
    if (op !== null) a.push('opacity="' + r(num(op, 1)) + '"');
    return '<text ' + a.join(' ') + ' xml:space="preserve">' + esc(text) + '</text>';
  }

  // ---------- API ----------
  function convert(src) {
    var ctx = {
      warnings: [],
      warn: function (m) { if (this.warnings.indexOf(m) < 0) this.warnings.push(m); }
    };
    var text = (src || '').replace(/^\s*<\?xml[^>]*\?>/, '');
    if (!text.trim()) return { error: 'Пустой кадр', warnings: [] };
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var pe = doc.getElementsByTagName('parsererror')[0];
    if (pe) {
      var msg = (pe.textContent || '').replace(/\s+/g, ' ').replace(/^.*?error on/i, 'Ошибка в').trim();
      return { error: msg || 'Ошибка разбора XAML', warnings: [] };
    }
    var root = doc.documentElement;
    var W = num(root.getAttribute('Width'), 500);
    var H = num(root.getAttribute('Height'), 500);
    var body;
    if (root.localName === 'Canvas') {
      var bg = color(prop(root, 'Background'));
      body = (bg ? '<rect width="' + r(W) + '" height="' + r(H) + '" fill="' + esc(bg) + '"/>' : '') + renderChildren(root, ctx, W, H);
    } else {
      body = renderEl(root, ctx, W, H);
    }
    return {
      width: W,
      height: H,
      warnings: ctx.warnings,
      svg: '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + r(W) + ' ' + r(H) + '" preserveAspectRatio="xMidYMid meet">' + body + '</svg>'
    };
  }

  var cache = new Map();
  function toSvg(src) {
    var c = cache.get(src);
    if (c) return c;
    c = convert(src);
    if (cache.size > 4000) cache.clear();
    cache.set(src, c);
    return c;
  }

  RIE.xaml = { toSvg: toSvg, color: color };
})(window.RIE = window.RIE || {});
