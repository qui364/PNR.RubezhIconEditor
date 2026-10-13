// Классы состояний и их русские названия (порядок — как в администраторе «Рубеж»).
(function (RIE) {
  'use strict';

  var STATES = [
    ['No', 'Базовый рисунок'],
    ['Norm', 'Норма'],
    ['Unknown', 'Неизвестно'],
    ['Test', 'Тест'],
    ['Failure', 'Неисправность'],
    ['Ignore', 'Отключено'],
    ['Fire1', 'Сработка 1'],
    ['Fire2', 'Сработка 2'],
    ['Attention', 'Внимание'],
    ['On', 'Включено'],
    ['Off', 'Выключено'],
    ['TurningOn', 'Включается'],
    ['TurningOff', 'Выключается'],
    ['AutoOff', 'Автоматика отключена'],
    ['Service', 'Обслуживание'],
    ['Info', 'Информация']
  ].map(function (s, i) {
    return { code: s[0], label: s[1], order: i };
  });

  var byCode = {};
  STATES.forEach(function (s) { byCode[s.code] = s; });

  RIE.states = {
    list: STATES,
    label: function (code) {
      return byCode[code] ? byCode[code].label : code;
    },
    order: function (code) {
      return byCode[code] ? byCode[code].order : 1000;
    }
  };
})(window.RIE = window.RIE || {});
