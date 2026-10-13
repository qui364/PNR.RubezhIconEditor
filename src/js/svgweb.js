// Превью SvgImage (рисунок для веб-клиента).
// SvgImage бывает полноценным SVG либо CSS-фрагментом, который накладывается на SVG
// базового состояния (No) того же устройства. Селектор `ext.gk-*` трактуется как `.gk-*`
// (гипотеза по примерам).
(function (RIE) {
  'use strict';

  function isSvg(s) {
    return /^\s*</.test(s || '');
  }

  function withXmlns(svg) {
    return /<svg[^>]*\sxmlns=/.test(svg) ? svg : svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  function escStyle(css) {
    return css.replace(/\bext\./g, '.').replace(/</g, '\\3c ');
  }

  // Возвращает { svg, overlay } или { error }
  function compose(device, state) {
    var src = state.svgImage;
    if (src === null || !src.trim()) return { error: 'Нет SVG' };
    if (isSvg(src)) return { svg: withXmlns(src), overlay: false };
    var base = null;
    for (var i = 0; i < device.states.length; i++) {
      if (device.states[i].stateClass === 'No') base = device.states[i].svgImage;
    }
    if (!isSvg(base)) return { error: 'CSS-стиль без базового SVG: у состояния «Базовый рисунок» нет SVG' };
    var svg = withXmlns(base).replace(/<svg\b[^>]*>/, function (m) {
      return m + '<style>' + escStyle(src) + '</style>';
    });
    return { svg: svg, overlay: true };
  }

  function dataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  RIE.svgweb = { compose: compose, dataUrl: dataUrl, isSvg: isSvg };
})(window.RIE = window.RIE || {});
