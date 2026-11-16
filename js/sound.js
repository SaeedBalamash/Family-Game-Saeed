/* مؤثرات صوتية مولَّدة بـ WebAudio — لا ملفات خارجية */
(function () {
  'use strict';
  var ctx = null, enabled = true;
  try { enabled = localStorage.getItem('fg-sound') !== '0'; } catch (e) {}

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  function tone(freq, start, dur, type, gain, slideTo) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  var FX = {
    tick: function () { tone(880, 0, 0.07, 'square', 0.06); },
    pop: function () { tone(420, 0, 0.12, 'sine', 0.12, 700); },
    whoosh: function () { tone(180, 0, 0.45, 'sawtooth', 0.06, 900); tone(660, 0.3, 0.3, 'triangle', 0.1); },
    round: function () { [392, 494, 587].forEach(function (f, i) { tone(f, i * 0.12, 0.3, 'triangle', 0.13); }); },
    reveal: function () { tone(220, 0, 0.5, 'sawtooth', 0.05, 660); tone(784, 0.5, 0.35, 'triangle', 0.14); tone(1047, 0.62, 0.4, 'triangle', 0.12); },
    correct: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.28, 'triangle', 0.16); }); },
    wrong: function () { tone(220, 0, 0.3, 'sawtooth', 0.1, 160); tone(160, 0.25, 0.5, 'sawtooth', 0.1, 90); },
    alert: function () { [740, 988, 740, 988].forEach(function (f, i) { tone(f, i * 0.11, 0.1, 'square', 0.08); }); },
    drum: function () { for (var i = 0; i < 12; i++) tone(110 + (i % 2) * 20, i * 0.07, 0.07, 'triangle', 0.12); tone(523, 0.9, 0.5, 'triangle', 0.15); },
    versus: function () { tone(110, 0, 0.6, 'sawtooth', 0.1, 55); tone(330, 0.35, 0.5, 'square', 0.07); },
    win: function () { [523, 659, 784].forEach(function (f, i) { tone(f, i * 0.13, 0.35, 'triangle', 0.15); }); tone(1047, 0.42, 0.7, 'triangle', 0.16); },
    fanfare: function () {
      var seq = [[523, 0, .18], [523, .2, .18], [523, .4, .18], [698, .6, .5], [587, 1.15, .18], [698, 1.35, .18], [880, 1.55, .9], [1047, 1.6, .9]];
      seq.forEach(function (n) { tone(n[0], n[1], n[2], 'triangle', 0.16); tone(n[0] / 2, n[1], n[2], 'sawtooth', 0.05); });
    }
  };
  window.FGSound = {
    play: function (name) { if (enabled && FX[name]) { try { FX[name](); } catch (e) {} } },
    isOn: function () { return enabled; },
    toggle: function () {
      enabled = !enabled;
      try { localStorage.setItem('fg-sound', enabled ? '1' : '0'); } catch (e) {}
      if (enabled) { ac(); FX.pop(); }
      return enabled;
    },
    unlock: function () { if (enabled) ac(); }
  };
})();
