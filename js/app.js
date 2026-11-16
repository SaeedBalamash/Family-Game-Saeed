/* واجهة بطولة العائلة: الإعداد، شاشة العرض (التلفاز)، لوحة المقدّم، وجوال التحكم */
(function () {
  'use strict';
  var E = window.FGEngine, D = window.FGData, Sound = window.FGSound;
  var params = new URLSearchParams(location.search);
  var VIEW = ({ tv: 'tv', remote: 'remote' })[params.get('view')] || 'host';

  var DIFF = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  var AGE = { child: 'طفل', teen: 'ناشئ', adult: 'بالغ' };
  var SKILL = { 1: 'مبتدئ', 2: 'متوسط', 3: 'خبير' };
  var LET = ['أ', 'ب', 'ج', 'د'];
  var AVATARS = ['👦', '👧', '👨', '👩', '👴', '👵', '🧒', '👶', '🧔', '🦁', '🐯', '🐼', '🦊', '🐨', '🐸', '🦄', '🐙', '🦉', '🚀', '⚽', '🎮', '🎨', '🌟', '👑'];
  var PRESETS = [
    { name: 'الصقور', emblem: '🦅', color: '#ffb703' }, { name: 'النجوم', emblem: '🌟', color: '#27c4ff' },
    { name: 'الأسود', emblem: '🦁', color: '#ff5d8f' }, { name: 'الفرسان', emblem: '🐎', color: '#6fe37a' }
  ];
  var COLORS = ['#ffb703', '#27c4ff', '#ff5d8f', '#6fe37a', '#b79cff', '#ff8a3d', '#2ee6c5', '#f76d6a', '#9bd0ff', '#e9c46a', '#ff9de2', '#c5e063'];
  var SAMPLE = [['أبو سعيد', '👨', 'adult', 3], ['أم سعيد', '👩', 'adult', 2], ['الجد', '👴', 'adult', 2], ['سعيد', '🧔', 'adult', 2],
    ['نورة', '👧', 'teen', 2], ['خالد', '👦', 'teen', 1], ['ريم', '🦄', 'child', 2], ['عمر', '🦁', 'child', 1]];
  var CAT = {};
  D.CATEGORIES.forEach(function (c) { CAT[c.id] = c; });

  var S = null;
  var ui = { page: 'home', edit: null, form: null, peek: false, bankMsg: null, qform: null, sig: '' };
  var undo = [];
  var shown = {};
  var lastKey = null, lastSec = null, server = false, serverUrls = [], gotState = false;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function A(a) { return 'data-act="' + esc(JSON.stringify(a)) + '"'; }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false; t.className = 'show';
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function team(id) { return E.team(S, id); }
  function player(id) { return E.player(S, id); }

  /* ════════ البنك المخصص ════════ */
  function customQs() { return store('fg-custom') || []; }
  function loadBank() { E.setBank(D.QUESTIONS.concat(customQs()), D.CATEGORIES); }

  /* ════════ الحالة والمزامنة ════════ */
  var bc = null;
  try { bc = new BroadcastChannel('fg-family-tournament'); } catch (e) {}

  function snapshot() {
    var c = JSON.parse(JSON.stringify(S));
    if (c.timer && c.timer.running) c.timer.left = Math.max(0, c.timer.endsAt - Date.now());
    c.page = ui.page;
    return c;
  }
  function save() { var c = snapshot(); E.freezeTimer(c, Date.now()); delete c.page; store('fg-state', c); }
  function publish() {
    if (VIEW !== 'host') return;
    var s = snapshot();
    if (bc) bc.postMessage({ t: 'state', s: s });
    if (server) fetch('api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).catch(function () {});
  }
  function commit() { save(); publish(); render(); }

  var REMOTE_OK = { NEXT: 1, PICK: 1, GO: 1, SECRET: 1, ANSWER: 1, JUDGE: 1, SWAP: 1, TIMER: 1, ADJUST: 1, TB_WIN: 1, TB_NONE: 1, TB_COIN: 1, UNDO: 1 };
  function dispatch(a) {
    if (VIEW === 'tv') return;
    if (VIEW === 'remote') {
      if (bc) bc.postMessage({ t: 'action', a: a });
      if (server) fetch('api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }).catch(function () {});
      if (navigator.vibrate) navigator.vibrate(15);
      return;
    }
    if (a.type === 'UNDO') {
      if (!undo.length) return toast('لا يوجد ما يمكن التراجع عنه');
      S = JSON.parse(undo.pop()); ui.peek = false;
      toast('تم التراجع عن آخر خطوة');
      return commit();
    }
    var snap = snapshot(); E.freezeTimer(snap, Date.now()); delete snap.page;
    var prevTurn = S.turn && S.turn.n;
    if (E.act(S, a, Date.now()) === false) return;
    if (a.type !== 'TIMER' && a.type !== 'SECRET' && a.type !== 'TIMEUP') { undo.push(JSON.stringify(snap)); if (undo.length > 40) undo.shift(); }
    if (!S.turn || S.turn.n !== prevTurn || S.turn.phase === 'result') ui.peek = false;
    commit();
  }
  function onRemoteAction(a) {
    if (VIEW !== 'host' || !a) return;
    if (a.type === 'HELLO') return publish();
    if (ui.page === 'game' && REMOTE_OK[a.type]) dispatch(a);
  }
  function onState(s) {
    if (VIEW === 'host') return;
    S = s; gotState = true;
    if (S.timer && S.timer.running) S.timer.endsAt = Date.now() + S.timer.left;
    render();
  }
  function connect() {
    if (bc) bc.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.t === 'state') onState(m.s);
      else if (m.t === 'action') onRemoteAction(m.a);
      else if (m.t === 'hello' && VIEW === 'host') publish();
    };
    if (VIEW !== 'host' && bc) bc.postMessage({ t: 'hello' });
    if (!/^http/.test(location.protocol)) return;
    fetch('api/info').then(function (r) { return r.ok ? r.json() : null; }).then(function (info) {
      if (!info || !info.ok) return;
      server = true; serverUrls = info.urls || [];
      var es = new EventSource('api/events?role=' + (VIEW === 'host' ? 'host' : 'view'));
      es.onmessage = function (ev) {
        var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (VIEW === 'host') onRemoteAction(d); else onState(d);
      };
      if (VIEW === 'host') publish();
    }).catch(function () {});
  }

  /* ════════ عناصر مشتركة ════════ */
  function teamStyle(t) { return 'style="--c:' + esc(t.color) + '"'; }
  function membersHTML(t, cls) {
    if (S.settings.mode === 'solo') return '';
    return '<div class="members ' + (cls || '') + '">' + t.members.map(function (id, i) {
      var p = player(id); if (!p) return '';
      return '<span class="member" style="--i:' + i + '"><i>' + esc(p.avatar) + '</i>' + esc(p.name) + '</span>';
    }).join('') + '</div>';
  }
  function catTag(id) { var c = CAT[id] || { icon: '❓', name: id }; return '<span class="tag cat">' + c.icon + ' ' + esc(c.name) + '</span>'; }
  function timerHTML() {
    return '<div class="timer" data-timer hidden><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="45"/><circle class="arc" cx="50" cy="50" r="45"/></svg><b></b></div>';
  }
  function inMatch() { return S.t && S.t.stage === 'bracket' && S.t.cur && ['matchIntro', 'turn', 'matchResult', 'tiebreak'].indexOf(S.screen) >= 0; }

  /* ════════ شاشات العرض ════════ */
  function stageKey() {
    if (VIEW !== 'host' && S.page !== 'game') return 'lobby';
    var T = S.turn;
    switch (S.screen) {
      case 'intro': return 'intro:' + S.intro.idx;
      case 'roundIntro': return 'round:' + S.t.round;
      case 'turn': return 'turn:' + T.n + ':' + T.phase + ':' + (T.q ? T.q.id : '');
      case 'scoreboard': return 'sb:' + S.t.round;
      case 'bracket': return 'br:' + JSON.stringify(E.nextMatch(S));
      case 'matchIntro': return 'mi:' + JSON.stringify(S.t.cur);
      case 'matchResult': return 'mr:' + JSON.stringify(S.t.cur);
      case 'tiebreak': return 'tb:' + S.tb.n + ':' + S.tb.phase;
      case 'winner': return 'winner';
      default: return 'lobby';
    }
  }

  function topbarHTML() {
    if (!S.t || ['turn', 'roundIntro', 'tiebreak', 'matchIntro'].indexOf(S.screen) < 0 || stageKey() === 'lobby') return '';
    var chips, label;
    if (inMatch()) {
      var m = E.curMatch(S);
      label = E.roundName(S, S.t.cur);
      chips = [[m.a, m.sa], [m.b, m.sb]].map(function (x) { return chip(team(x[0]), x[1], 'm' + m.id + x[0]); }).join('<span class="vs-mini">×</span>');
    } else {
      label = 'الجولة ' + (S.t.round + 1) + ' من ' + S.t.rounds;
      chips = S.teams.map(function (t) { return chip(t, t.score, 'g' + t.id); }).join('');
    }
    return '<div class="tb-label">' + esc(label) + '</div><div class="chips' + (S.teams.length > 5 ? ' many' : '') + '">' + chips + '</div>';
  }
  function chip(t, score, key) {
    var active = S.turn && (S.turn.phase === 'steal' ? S.turn.stealTeamId : S.turn.teamId) === t.id;
    return '<div class="chip' + (active ? ' active' : '') + '" ' + teamStyle(t) + '><i>' + esc(t.emblem) + '</i><span>' + esc(t.name) +
      '</span><b data-count="' + key + '" data-val="' + score + '">' + score + '</b></div>';
  }

  function lobbyHTML() {
    var ps = (S && S.players) || [];
    return '<div class="lobby"><div class="trophy">🏆</div><h1 class="title">بطولة العائلة</h1>' +
      '<p class="sub">' + (ps.length ? 'المتسابقون يستعدون…' : 'بانتظار المقدّم لبدء البطولة') + '</p>' +
      '<div class="lobby-players">' + ps.map(function (p, i) { return '<span class="member big" style="--i:' + i + '"><i>' + esc(p.avatar) + '</i>' + esc(p.name) + '</span>'; }).join('') + '</div></div>';
  }

  function introHTML() {
    if (S.settings.mode === 'solo') {
      return '<div class="intro solo"><p class="kicker">المتسابقون</p><h1 class="title">كل لاعب بطل نفسه!</h1><div class="solo-grid">' +
        S.teams.map(function (t, i) { return '<div class="solo-card" style="--c:' + t.color + ';--i:' + i + '"><i>' + esc(t.emblem) + '</i><b>' + esc(t.name) + '</b></div>'; }).join('') + '</div></div>';
    }
    var t = S.teams[S.intro.idx];
    return '<div class="intro" ' + teamStyle(t) + '><div class="spot"></div><p class="kicker">الفريق ' + (S.intro.idx + 1) + ' من ' + S.teams.length + '</p>' +
      '<div class="emblem-xl">' + esc(t.emblem) + '</div><h1 class="team-title">' + esc(t.name) + '</h1>' + membersHTML(t, 'xl') + '</div>';
  }

  function roundHTML() {
    var t = S.t, c = CAT[t.roundCats[t.round]];
    var dbl = S.settings.doubleLast && t.rounds > 1 && t.round === t.rounds - 1;
    return '<div class="round"><p class="kicker">الجولة</p><div class="round-num">' + (t.round + 1) + '<small>/' + t.rounds + '</small></div>' +
      '<div class="round-cat"><span class="ico">' + c.icon + '</span><h1>' + esc(c.name) + '</h1><p>' + esc(c.desc) + '</p></div>' +
      (dbl ? '<div class="double">🔥 الجولة الأخيرة: النقاط مضاعفة ×2</div>' : '') + '</div>';
  }

  function turnHTML() {
    var T = S.turn, t = team(T.teamId), p = player(T.playerId), q = T.q, body = '', banner = '';
    var solo = S.settings.mode === 'solo';
    var head = '<div class="turn-head"><div class="who" ' + teamStyle(t) + '><i class="emblem">' + esc(t.emblem) + '</i><div><b>' + esc(t.name) + '</b>' +
      (solo || !p ? '' : '<small>يجيب: ' + esc(p.avatar) + ' ' + esc(p.name) + '</small>') + '</div></div>' +
      '<div class="tags">' + catTag(T.cat) + (T.diff ? '<span class="tag diff d-' + T.diff + '">' + DIFF[T.diff] + ' · ' + T.points + ' نقطة</span>' : '') +
      (T.mult > 1 ? '<span class="tag x2">×2</span>' : '') + '</div>';

    if (T.phase === 'pick') {
      var auto = S.settings.diffMode === 'auto';
      body = '<h2 class="ask">' + (auto ? 'مستوى السؤال' : 'اختاروا مستوى السؤال') + '</h2><div class="picks">' + E.DIFFS.map(function (d, i) {
        if (auto && d !== T.rec) return '';
        return '<button class="pick d-' + d + (d === T.rec ? ' rec' : '') + '" style="--i:' + i + '" ' + A({ type: 'PICK', diff: d }) + '>' +
          '<span class="stars">' + '★'.repeat(i + 1) + '</span><b>' + DIFF[d] + '</b><em>' + E.POINTS[d] * T.mult + '</em><small>نقطة</small>' +
          (d === T.rec && !auto && p ? '<u>مناسب لـ ' + esc(p.name) + '</u>' : '') + '</button>';
      }).join('') + '</div>';
    } else if (T.phase === 'prep') {
      if (q.type === 'charades') {
        body = '<div class="bigcard"><div class="ico">🎭</div><h2>تمثيل صامت</h2><p>' + esc(p ? p.name : t.name) + ' يمثّل و' + (solo ? 'الجميع يخمّن' : 'فريقه يخمّن') + ' — ممنوع الكلام والإشارة إلى الأشياء!</p>' +
          '<div class="hint">التصنيف: ' + esc(q.hint || '') + '</div>' +
          (T.secret ? '<div class="secret on"><small>🙈 الجميع يغمض عينيه إلا الممثل</small><b>' + esc(q.word) + '</b></div>'
            : '<div class="secret"><small>الكلمة مخفية</small><b>● ● ● ●</b></div>') + '</div>';
      } else if (q.type === 'physical') {
        body = '<div class="bigcard"><div class="ico">🤸</div><h2>تحدٍّ حركي</h2><p class="challenge">' + esc(q.q) + '</p><div class="hint">⏱ ' + q.seconds + ' ثانية — استعد!</div></div>';
      } else {
        body = '<div class="bigcard"><div class="ico">🧠</div><h2>اختبار الذاكرة</h2><p>ركّزوا جيدًا! ستظهر العناصر لمدة <b>' + q.memo.seconds + '</b> ثوانٍ ثم تختفي.</p></div>';
      }
    } else if (T.phase === 'memorize') {
      body = '<h2 class="ask">احفظوا ما ترون!</h2>' + memoHTML(q);
    } else {
      // question / steal / result
      var res = T.phase === 'result', o = T.outcome;
      if (T.phase === 'steal') {
        var st = team(T.stealTeamId);
        banner = '<div class="banner steal" ' + teamStyle(st) + '>⚡ فرصة للخطف! ' + esc(st.emblem) + ' ' + esc(st.name) + ' — ' + (T.points / 2) + ' نقطة</div>';
      } else if (res) {
        if (o.ok) {
          var wt = team(o.teamId);
          banner = '<div class="banner good" ' + teamStyle(wt) + '>' + (o.by === 'steal' ? '⚡ خطفها ' + esc(wt.name) + '!' : '✅ إجابة صحيحة!') +
            ' <b class="plus">+' + o.points + '</b></div>';
        } else banner = '<div class="banner bad">' + (o.timeout && !o.stealTried ? '⏰ انتهى الوقت!' : '❌ لم يُحرز أحد النقاط') + '</div>';
      }
      if (q.type === 'charades') {
        body = '<div class="bigcard' + (res ? ' done' : ' live') + '"><div class="ico">🎭</div>' +
          (res ? '<h2>الكلمة كانت</h2><div class="secret on"><b>' + esc(q.word) + '</b></div>' : '<h2>مثّل الآن!</h2><div class="hint">التصنيف: ' + esc(q.hint || '') + '</div>') + '</div>';
      } else if (q.type === 'physical') {
        body = '<div class="bigcard' + (res ? ' done' : ' live') + '"><div class="ico">🤸</div><p class="challenge">' + esc(q.q) + '</p>' + (q.exp ? '<div class="hint">' + esc(q.exp) + '</div>' : '') + '</div>';
      } else {
        body = '<div class="qcard"><span class="qmark">؟</span><p>' + esc(q.q) + '</p></div>' + (q.visual ? gridHTML(q.visual) : '');
        if (q.options) {
          body += '<div class="opts n' + q.options.length + '">' + q.options.map(function (op, i) {
            var cls = 'opt';
            if (T.wrongPicked.indexOf(i) >= 0) cls += ' wrong';
            if (res && i === q.answer) cls += ' right';
            if (res && i !== q.answer) cls += ' dim';
            return '<button class="' + cls + '" style="--i:' + i + '" ' + (res ? 'disabled' : A({ type: 'ANSWER', i: i })) + '><i>' + LET[i] + '</i><span>' + esc(op) + '</span></button>';
          }).join('') + '</div>';
        } else if (res) body += '<div class="open-answer">الإجابة: <b>' + esc(q.answer) + '</b></div>';
        if (res && q.exp) body += '<div class="exp">💡 ' + esc(q.exp) + '</div>';
      }
    }
    head += (banner ? '<div class="banner-wrap">' + banner + '</div>' : '') + timerHTML() + '</div>';
    return '<div class="turn ph-' + T.phase + (banner ? ' has-banner' : '') + (q && q.visual ? ' has-visual' : '') + '">' + head + '<div class="turn-body">' + body + '</div></div>';
  }
  function gridHTML(v) {
    var cols = v.grid[0].length;
    return '<div class="vgrid" style="--cols:' + cols + ';--rows:' + v.grid.length + '">' + v.grid.map(function (row, r) {
      return '<div class="vrow">' + (v.rowNums ? '<u>' + (r + 1) + '</u>' : '') + row.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
    }).join('') + '</div>';
  }
  function memoHTML(q) {
    if (q.memo.big) return '<div class="memo-num">' + esc(q.memo.items[0]) + '</div>';
    return '<div class="memo">' + q.memo.items.map(function (it, i) {
      var sp = it.indexOf(' ');
      return '<div class="memo-card" style="--i:' + i + '"><u>' + (i + 1) + '</u><i>' + esc(it.slice(0, sp)) + '</i><b>' + esc(it.slice(sp + 1)) + '</b></div>';
    }).join('') + '</div>';
  }

  function scoreboardHTML() {
    var t = S.t, st = E.standings(S), last = t.round === t.rounds - 1;
    var max = Math.max.apply(null, st.map(function (x) { return x.score; }).concat([10]));
    var cut = last && S.settings.format === 'full' ? E.qualifyCount(S) : 0;
    return '<div class="sb"><p class="kicker">' + (last ? 'نهاية دور المجموعات' : 'بعد الجولة ' + (t.round + 1)) + '</p><h1 class="title">لوحة النتائج</h1><div class="sb-rows' + (st.length > 5 ? ' many' : '') + '">' +
      st.map(function (x, i) {
        var prev = t.prevScores[x.id] || 0, gain = x.score - prev;
        return '<div class="sb-row' + (cut && i < cut ? ' q' : '') + '" style="--c:' + x.color + ';--i:' + i + '"><span class="rank">' + (['🥇', '🥈', '🥉'][i] || (i + 1)) + '</span>' +
          '<span class="sb-name"><i>' + esc(x.emblem) + '</i>' + esc(x.name) + (cut && i < cut && cut < st.length ? '<em>متأهل</em>' : '') + '</span>' +
          '<span class="bar"><i data-w="' + Math.round(x.score / max * 100) + '" style="width:' + Math.round(prev / max * 100) + '%"></i></span>' +
          (gain > 0 ? '<span class="gain">+' + gain + '</span>' : '<span class="gain"></span>') +
          '<b class="sb-score" data-count="sb' + t.round + x.id + '" data-from="' + prev + '" data-val="' + x.score + '">' + prev + '</b></div>';
      }).join('') + '</div></div>';
  }

  function bracketHTML() {
    var br = S.t.bracket, nm = E.nextMatch(S);
    function side(m, id, sc) {
      if (!id) return '<div class="slot empty">' + (m.bye ? '—' : 'بانتظار الفائز') + '</div>';
      var t = team(id);
      return '<div class="slot' + (m.done && m.winner === id ? ' win' : '') + (m.done && m.winner !== id ? ' lose' : '') + '" ' + teamStyle(t) + '><i>' + esc(t.emblem) + '</i><span>' + esc(t.name) + '</span>' +
        (m.bye ? '' : '<b>' + (m.done || m.turn ? sc : '') + '</b>') + '</div>';
    }
    function box(m, isCur, label) {
      return '<div class="match' + (isCur ? ' cur' : '') + (m.bye ? ' bye' : '') + '">' + (label ? '<small>' + label + '</small>' : '') + side(m, m.a, m.sa) + side(m, m.b, m.sb) +
        (m.bye ? '<em>تأهل مباشر</em>' : '') + (m.tb ? '<em>حُسمت بسؤال الحسم</em>' : '') + '</div>';
    }
    var cols = br.rounds.map(function (list, r) {
      return '<div class="br-col"><h3>' + E.roundName(S, { r: r }) + '</h3><div class="br-list">' + list.map(function (m, i) {
        return box(m, nm && !nm.third && nm.r === r && nm.i === i);
      }).join('') + '</div></div>';
    }).join('');
    var champ = br.champion ? team(br.champion) : null;
    return '<div class="bracket"><p class="kicker">' + (nm ? 'الأدوار الإقصائية' : 'اكتملت البطولة') + '</p><h1 class="title">شجرة البطولة</h1><div class="br-wrap">' + cols +
      '<div class="br-col champ"><h3>البطل</h3><div class="br-list"><div class="cup' + (champ ? ' has' : '') + '">' + (champ ? '<i>' + esc(champ.emblem) + '</i><b>' + esc(champ.name) + '</b>' : '🏆') + '</div>' +
      (br.third ? box(br.third, nm && nm.third, 'المركز الثالث') : '') + '</div></div></div></div>';
  }

  function matchIntroHTML() {
    var m = E.curMatch(S), a = team(m.a), b = team(m.b);
    function side(t, cls) { return '<div class="vs-side ' + cls + '" ' + teamStyle(t) + '><div class="emblem-xl">' + esc(t.emblem) + '</div><h2>' + esc(t.name) + '</h2>' + membersHTML(t) + '</div>'; }
    return '<div class="vs"><h1 class="title">' + E.roundName(S, S.t.cur) + '</h1><div class="vs-row">' + side(a, 'a') + '<div class="vs-badge">VS</div>' + side(b, 'b') + '</div>' +
      '<p class="sub">' + S.settings.matchQ + ' أسئلة لكل طرف — والتعادل يُحسم بسؤال السرعة</p></div>';
  }
  function matchResultHTML() {
    var m = E.curMatch(S), w = team(m.winner), final = !S.t.cur.third && S.t.cur.r === S.t.bracket.rounds.length - 1;
    var a = team(m.a), b = team(m.b);
    return '<div class="mresult" ' + teamStyle(w) + '><p class="kicker">' + E.roundName(S, S.t.cur) + '</p><div class="emblem-xl">' + esc(w.emblem) + '</div>' +
      '<h1 class="team-title">' + esc(w.name) + '</h1><p class="sub">' + (final ? 'يفوز بالنهائي! 🎉' : S.t.cur.third ? 'يحصد المركز الثالث 🥉' : 'يتأهل إلى الدور التالي') + '</p>' +
      '<div class="final-score"><span>' + esc(a.name) + '</span><b>' + m.sa + '</b><i>—</i><b>' + m.sb + '</b><span>' + esc(b.name) + '</span></div>' +
      (m.tb ? '<div class="hint">حُسمت بسؤال الحسم ⚡</div>' : '') + '</div>';
  }

  function tiebreakHTML() {
    var tb = S.tb, q = tb.q, body;
    var teams = '<div class="tb-teams">' + tb.all.map(function (id) {
      var t = team(id), won = tb.winners.indexOf(id) >= 0;
      return '<span class="tbadge' + (won ? ' won' : '') + '" ' + teamStyle(t) + '>' + esc(t.emblem) + ' ' + esc(t.name) + (won ? ' ✓' : '') + '</span>';
    }).join('') + '</div>';
    if (tb.phase === 'intro') {
      body = '<div class="bigcard"><div class="ico">⚡</div><h2>تعادل! سؤال الحسم</h2><p>' + (tb.reason === 'match' ? 'النتيجة متعادلة.' : 'تعادل تام في الترتيب.') +
        ' يُطرح سؤال على الجميع، وأول من يجيب إجابة صحيحة يفوز' + (tb.slots > 1 ? ' (المطلوب ' + tb.slots + ' فائزين)' : '') + '.</p></div>';
    } else {
      var rev = tb.phase === 'reveal';
      body = q ? '<div class="qcard"><span class="qmark">؟</span><p>' + esc(q.q) + '</p></div><div class="opts n' + q.options.length + '">' + q.options.map(function (op, i) {
        return '<div class="opt' + (rev && i === q.answer ? ' right' : rev ? ' dim' : '') + '" style="--i:' + i + '"><i>' + LET[i] + '</i><span>' + esc(op) + '</span></div>';
      }).join('') + '</div>' : '<div class="bigcard"><div class="ico">🎲</div><h2>القرعة تحسم!</h2></div>';
      if (rev) {
        var w = tb.last.teamId != null ? team(tb.last.teamId) : null;
        body = (w ? '<div class="banner good" ' + teamStyle(w) + '>' + (tb.last.coin ? '🎲 القرعة اختارت: ' : '⚡ الأسرع: ') + esc(w.emblem) + ' ' + esc(w.name) + '</div>'
          : '<div class="banner bad">لا أحد أجاب — سؤال آخر!</div>') + body;
      }
    }
    return '<div class="turn tiebreak"><div class="turn-head"><div class="who" style="--c:#ffd166"><i class="emblem">⚡</i><div><b>سؤال الحسم</b><small>الأسرع يفوز</small></div></div>' + teams + timerHTML() + '</div><div class="turn-body">' + body + '</div></div>';
  }

  function winnerHTML() {
    var r = S.result, w = team(r.ranking[0]), solo = S.settings.mode === 'solo';
    var podium = [1, 0, 2].filter(function (i) { return r.ranking[i]; }).map(function (i) {
      var t = team(r.ranking[i]);
      return '<div class="pod p' + (i + 1) + '" ' + teamStyle(t) + '><i>' + esc(t.emblem) + '</i><b>' + esc(t.name) + '</b><span>' + ['🥇', '🥈', '🥉'][i] + '</span><small>' + t.total + ' نقطة</small></div>';
    }).join('');
    var awards = [];
    if (r.mvp && !solo) { var mp = player(r.mvp); awards.push('<div class="award"><i>⭐</i><small>نجم البطولة</small><b>' + esc(mp.avatar) + ' ' + esc(mp.name) + '</b><span>' + mp.points + ' نقطة</span></div>'); }
    if (r.kid) { var kp = player(r.kid); awards.push('<div class="award"><i>🌱</i><small>النجم الصغير</small><b>' + esc(kp.avatar) + ' ' + esc(kp.name) + '</b><span>' + kp.correct + ' إجابات صحيحة</span></div>'); }
    if (r.thief) { var th = team(r.thief); awards.push('<div class="award"><i>⚡</i><small>ملك الخطف</small><b>' + esc(th.emblem) + ' ' + esc(th.name) + '</b><span>' + th.steals + ' خطفات</span></div>'); }
    return '<div class="winner" ' + teamStyle(w) + '><div class="rays"></div><p class="kicker">بطل البطولة</p><div class="trophy">🏆</div>' +
      '<h1 class="team-title">' + esc(w.emblem) + ' ' + esc(w.name) + '</h1>' + membersHTML(w, 'xl') +
      '<div class="podium">' + podium + '</div>' + (awards.length ? '<div class="awards">' + awards.join('') + '</div>' : '') + '</div>';
  }

  function screenHTML(key) {
    if (key === 'lobby') return lobbyHTML();
    switch (S.screen) {
      case 'intro': return introHTML();
      case 'roundIntro': return roundHTML();
      case 'turn': return turnHTML();
      case 'scoreboard': return scoreboardHTML();
      case 'bracket': return bracketHTML();
      case 'matchIntro': return matchIntroHTML();
      case 'matchResult': return matchResultHTML();
      case 'tiebreak': return tiebreakHTML();
      case 'winner': return winnerHTML();
    }
    return lobbyHTML();
  }

  function fxFor(key) {
    var T = S.turn;
    switch (key.split(':')[0]) {
      case 'intro': return 'whoosh';
      case 'round': return 'round';
      case 'turn':
        if (T.phase === 'pick') return 'pop';
        if (T.phase === 'question' || T.phase === 'memorize') return 'reveal';
        if (T.phase === 'steal') return 'alert';
        if (T.phase === 'result') return T.outcome.ok ? 'correct' : 'wrong';
        return 'pop';
      case 'sb': return 'drum';
      case 'br': return 'pop';
      case 'mi': return 'versus';
      case 'mr': return 'win';
      case 'tb': return S.tb.phase === 'reveal' ? (S.tb.last.teamId != null ? 'correct' : 'wrong') : S.tb.phase === 'question' ? 'reveal' : 'alert';
      case 'winner': return 'fanfare';
    }
    return null;
  }

  function renderStage() {
    var key = stageKey(), scr = $('#screen');
    var changed = key !== lastKey;
    $('#topbar').innerHTML = topbarHTML();
    scr.innerHTML = screenHTML(key);
    scr.className = changed ? 'enter' : 'still';
    scr.dataset.key = key;
    if (changed) {
      if (lastKey !== null || VIEW === 'host') Sound.play(fxFor(key));
      lastKey = key; lastSec = null;
      confetti(key === 'winner' ? 2 : key.indexOf('mr:') === 0 ? 1 : 0);
    }
    $('#stage').classList.toggle('interactive', VIEW === 'host');
    animateCounts(changed);
    fit();
    tick();
  }
  // يصغّر المحتوى تلقائيًا إذا تجاوز مساحة الشاشة (أسئلة طويلة، شاشات صغيرة)
  function fit() {
    var el = $('#screen .turn-body') || $('#screen > *');
    if (!el) return;
    var deco = $$('.rays, .spot', el), f = 1, scr = $('#screen');
    deco.forEach(function (d) { d.style.display = 'none'; });   // الزخارف لا تدخل في القياس
    scr.classList.add('measuring');                               // ولا حركات الدخول (تكبير/إزاحة)
    el.style.fontSize = '';
    while (el.scrollHeight > el.clientHeight + 2 && f > 0.5) { f -= 0.05; el.style.fontSize = f + 'em'; }
    scr.classList.remove('measuring');
    deco.forEach(function (d) { d.style.display = ''; });
  }

  function animateCounts(entering) {
    $$('#stage [data-count]').forEach(function (el) {
      var key = el.dataset.count, to = +el.dataset.val;
      var from = el.dataset.from != null && entering ? +el.dataset.from : (shown[key] != null ? shown[key] : to);
      if (el.dataset.from != null && !entering) from = to;
      shown[key] = to;
      if (from === to) { el.textContent = to; return; }
      el.classList.add('bump');
      var t0 = performance.now() + (el.dataset.from != null ? 900 : 0), dur = 900;
      el.textContent = from;
      (function step(now) {
        if (!el.isConnected) return;
        var k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
      })(performance.now());
    });
    setTimeout(function () { $$('#stage .bar i[data-w]').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); }, entering ? 900 : 0);
  }

  /* ── المؤقت ── */
  function tick() {
    if (!S) return;
    var T = S.timer, left = null;
    if (T) left = Math.max(0, Math.min(T.dur * 1000, T.running ? T.endsAt - Date.now() : T.left));
    $$('[data-timer]').forEach(function (el) {
      if (left == null) { el.hidden = true; return; }
      el.hidden = false;
      var s = Math.ceil(left / 1000);
      el.querySelector('b').textContent = s;
      el.querySelector('.arc').style.strokeDashoffset = 283 * (1 - left / (T.dur * 1000));
      el.classList.toggle('low', s <= 5);
      el.classList.toggle('paused', !T.running);
    });
    if (T && T.running) {
      var sec = Math.ceil(left / 1000);
      if (sec !== lastSec) { if (lastSec !== null && sec <= 5 && sec > 0 && VIEW !== 'remote') Sound.play('tick'); lastSec = sec; }
      if (VIEW === 'host' && ui.page === 'game' && Date.now() >= T.endsAt) dispatch({ type: 'TIMEUP' });
    }
  }

  /* ── قصاصات الاحتفال ── */
  var cf = { parts: [], raf: 0, level: 0 };
  function confetti(level) {
    var cv = $('#fx'); cf.level = level;
    if (!level) { cf.parts = []; return; }
    cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    var n = level === 2 ? 220 : 90;
    for (var i = 0; i < n; i++) cf.parts.push(mkPart(cv, true));
    if (!cf.raf) cf.raf = requestAnimationFrame(cfStep);
  }
  function mkPart(cv, init) {
    return { x: Math.random() * cv.width, y: init ? -Math.random() * cv.height : -20, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4,
      s: 6 + Math.random() * 9, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: COLORS[Math.floor(Math.random() * COLORS.length)] };
  }
  function cfStep() {
    var cv = $('#fx'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    cf.parts = cf.parts.filter(function (p) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
      if (p.y > cv.height + 20) { if (cf.level === 2) { var n = mkPart(cv, false); for (var k in n) p[k] = n[k]; return true; } return false; }
      return true;
    });
    cf.raf = cf.parts.length ? requestAnimationFrame(cfStep) : 0;
  }

  /* ════════ أزرار التحكم (لوحة المقدّم + الجوال) ════════ */
  function controls() {
    var B = [], T = S.turn, sc = S.screen;
    function nx(t) { B.push({ t: t, a: { type: 'NEXT' }, c: 'primary', k: 'مسافة' }); }
    if (sc === 'intro') nx(S.intro.idx + 1 < S.intro.count ? 'الفريق التالي' : 'لنبدأ البطولة!');
    else if (sc === 'roundIntro') nx('ابدأ الجولة');
    else if (sc === 'turn') {
      if (T.phase === 'pick') {
        if (S.settings.diffMode === 'auto') nx('اكشف السؤال (' + DIFF[T.rec] + ')');
        else E.DIFFS.forEach(function (d, i) { B.push({ t: DIFF[d] + ' · ' + E.POINTS[d] * T.mult, a: { type: 'PICK', diff: d }, c: 'd-' + d + (d === T.rec ? ' rec' : ''), k: i + 1 }); });
      } else if (T.phase === 'prep') {
        if (T.q.type === 'charades') B.push({ t: T.secret ? '🙈 أخفِ الكلمة' : '👁 أظهر الكلمة للممثل', a: { type: 'SECRET' } });
        nx(T.q.type === 'memory' ? 'اعرض العناصر' : 'ابدأ الوقت');
      } else if (T.phase === 'memorize') nx('إلى السؤال');
      else if (T.phase === 'question' || T.phase === 'steal') {
        if (T.q.options) T.q.options.forEach(function (o, i) { B.push({ t: LET[i], long: LET[i] + ' — ' + o, a: { type: 'ANSWER', i: i }, c: 'optb' + (i === T.q.answer ? ' is-right' : ''), dis: T.wrongPicked.indexOf(i) >= 0, k: i + 1 }); });
        else B.push({ t: '✓ صحيحة', a: { type: 'JUDGE', ok: true }, c: 'good', k: 'C' });
        B.push({ t: T.q.options ? '✗ بلا إجابة' : '✗ خاطئة', a: { type: 'JUDGE', ok: false }, c: 'bad', k: 'X' });
      } else nx('التالي');
    } else if (sc === 'scoreboard') nx(S.t.round + 1 < S.t.rounds ? 'الجولة التالية' : 'متابعة');
    else if (sc === 'bracket') nx(E.nextMatch(S) ? 'إلى المباراة التالية' : 'التتويج');
    else if (sc === 'matchIntro') nx('ابدأ المباراة');
    else if (sc === 'matchResult') nx(E.nextMatch(S) ? 'متابعة' : 'إلى منصة التتويج 🏆');
    else if (sc === 'tiebreak') {
      if (S.tb.phase === 'question') {
        S.tb.teamIds.forEach(function (id) { var t = team(id); B.push({ t: '⚡ ' + t.name, a: { type: 'TB_WIN', teamId: id }, c: 'teamb', color: t.color }); });
        if (S.tb.q) B.push({ t: 'لا أحد', a: { type: 'TB_NONE' }, c: 'bad' });
        B.push({ t: '🎲 قرعة', a: { type: 'TB_COIN' } });
      } else nx(S.tb.phase === 'intro' ? 'اعرض سؤال الحسم' : 'متابعة');
    }
    return B;
  }
  function statusText() {
    var T = S.turn;
    if (S.screen === 'turn') {
      var t = team(T.phase === 'steal' ? T.stealTeamId : T.teamId), p = player(T.playerId);
      var ph = { pick: 'اختيار المستوى', prep: 'استعداد', memorize: 'حفظ العناصر', question: 'بانتظار الإجابة', steal: 'فرصة الخطف', result: 'النتيجة' }[T.phase];
      return t.emblem + ' ' + t.name + (T.phase !== 'steal' && p && S.settings.mode !== 'solo' ? ' · ' + p.name : '') + ' — ' + ph;
    }
    return ({ intro: 'تقديم الفرق', roundIntro: 'جولة جديدة', scoreboard: 'لوحة النتائج', bracket: 'شجرة البطولة', matchIntro: 'مباراة إقصائية', matchResult: 'نتيجة المباراة', tiebreak: 'سؤال الحسم', winner: 'التتويج' })[S.screen] || '';
  }
  function secretAnswer() {
    var q = S.screen === 'tiebreak' ? S.tb && S.tb.q : S.turn && S.turn.q;
    if (!q) return '';
    if (q.type === 'charades') return q.word;
    if (q.type === 'physical') return q.exp || '';
    return q.options ? LET[q.answer] + ' — ' + q.options[q.answer] : q.answer;
  }
  function btnHTML(b, long) {
    return '<button class="btn ' + (b.c || '') + '"' + (b.color ? ' style="--c:' + b.color + '"' : '') + (b.dis ? ' disabled' : '') + ' ' + A(b.a) + '>' +
      esc(long && b.long ? b.long : b.t) + (b.k && !long ? '<kbd>' + b.k + '</kbd>' : '') + '</button>';
  }
  function toolsHTML() {
    var T = S.timer, live = S.turn && ['prep', 'memorize', 'question'].indexOf(S.turn.phase) >= 0 && !S.turn.wrongPicked.length;
    return (T ? '<button class="tool" title="إيقاف/متابعة المؤقت (P)" ' + A({ type: 'TIMER', op: T.running ? 'pause' : 'resume' }) + '>' + (T.running ? '⏸️' : '▶️') + '</button>' +
      '<button class="tool" title="أضف 10 ثوانٍ" ' + A({ type: 'TIMER', op: 'add' }) + '>+10</button>' : '') +
      (live ? '<button class="tool" title="بدّل السؤال" ' + A({ type: 'SWAP' }) + '>🔁</button>' : '') +
      '<button class="tool" title="تراجع (U)" ' + A({ type: 'UNDO' }) + '>↩️</button>';
  }
  function renderDock() {
    var B = controls(), ans = secretAnswer();
    $('#dock').innerHTML = '<div class="dock-status"><b>' + esc(statusText()) + '</b>' +
      (ui.peek && ans ? '<span class="peek">🔒 ' + esc(ans) + '</span>' : '') + '</div>' +
      '<div class="dock-main">' + B.map(function (b) { return btnHTML(b); }).join('') +
      (S.screen === 'winner' ? '<button class="btn primary" data-do="newGame">بطولة جديدة</button><button class="btn" data-do="rematch">إعادة بالفرق نفسها</button>' : '') + '</div>' +
      '<div class="dock-tools">' + toolsHTML() +
      (ans ? '<button class="tool' + (ui.peek ? ' on' : '') + '" title="الإجابة للمقدّم فقط" data-do="peek">👁</button>' : '') +
      (S.t && S.screen !== 'winner' ? '<button class="tool" title="تعديل النقاط" data-do="scores">±</button>' : '') +
      '<button class="tool" title="الصوت (M)" data-do="sound">' + (Sound.isOn() ? '🔊' : '🔇') + '</button>' +
      '<button class="tool" title="وضع التلفاز — ملء الشاشة (F)" data-do="tv">📺</button>' +
      '<button class="tool" title="الشاشات المرافقة" data-do="companion">📱</button>' +
      '<button class="tool" title="القائمة الرئيسية" data-do="home">☰</button></div>';
  }

  function renderRemote() {
    var el = $('#remote');
    if (!gotState) { el.innerHTML = '<div class="r-wait"><div class="trophy">📱</div><h2>جوال التحكم</h2><p>بانتظار الاتصال بشاشة المقدّم…<br>افتح اللعبة على الشاشة الرئيسية أولًا.</p></div>'; return; }
    if (S.page !== 'game') { el.innerHTML = '<div class="r-wait"><div class="trophy">🏆</div><h2>بطولة العائلة</h2><p>الإعداد جارٍ على الشاشة الرئيسية…</p></div>'; return; }
    var B = controls(), ans = secretAnswer(), T = S.turn;
    var q = S.screen === 'tiebreak' ? S.tb.q : T && T.q;
    var qtxt = q ? (q.type === 'charades' ? 'تمثيل صامت (' + (q.hint || '') + ')' : q.q) : '';
    var scores = S.t && S.screen !== 'winner' ? '<details class="r-scores"><summary>± تعديل النقاط</summary>' + adjustRows() + '</details>' : '';
    el.innerHTML = '<header class="r-head"><b>' + esc(statusText()) + '</b>' + timerHTML() + '</header>' +
      (q ? '<section class="r-q"><p>' + esc(qtxt) + '</p>' + (ans ? '<div class="r-ans">🔒 الإجابة: <b>' + esc(ans) + '</b></div>' : '') + (q.exp && q.type !== 'physical' ? '<small>' + esc(q.exp) + '</small>' : '') + '</section>' : '') +
      '<section class="r-main">' + B.map(function (b) { return btnHTML(b, true); }).join('') + '</section>' +
      '<section class="r-tools">' + toolsHTML() + '</section>' + scores;
    tick();
  }
  function adjustRows() {
    var m = inMatch() ? E.curMatch(S) : null;
    return S.teams.map(function (t) {
      var sc = m && !m.done && (m.a === t.id || m.b === t.id) ? (m.a === t.id ? m.sa : m.sb) : t.score;
      return '<div class="adj" ' + teamStyle(t) + '><span>' + esc(t.emblem) + ' ' + esc(t.name) + '</span>' +
        [-10, -5].map(function (d) { return '<button class="tool" ' + A({ type: 'ADJUST', teamId: t.id, delta: d }) + '>' + d + '</button>'; }).join('') + '<b>' + sc + '</b>' +
        [5, 10].map(function (d) { return '<button class="tool" ' + A({ type: 'ADJUST', teamId: t.id, delta: d }) + '>+' + d + '</button>'; }).join('') + '</div>';
    }).join('');
  }

  /* ════════ صفحات الإعداد ════════ */
  function steps(cur) {
    var names = ['اللاعبون', 'الإعدادات', S.settings.mode === 'solo' ? 'المتسابقون' : 'الفرق'];
    return '<ol class="steps">' + names.map(function (n, i) { return '<li class="' + (i === cur ? 'on' : i < cur ? 'done' : '') + '"><i>' + (i + 1) + '</i>' + n + '</li>'; }).join('') + '</ol>';
  }
  function seg(name, opts, val) {
    return '<div class="seg">' + opts.map(function (o) { return '<button type="button" class="' + (String(o[0]) === String(val) ? 'on' : '') + '" data-do="set" data-k="' + name + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function inProgress() { return S.screen !== 'setup'; }

  function homePage() {
    var bank = E.getBank().length;
    return '<section class="home"><div class="trophy">🏆</div><h1 class="title">بطولة العائلة</h1><p class="sub">سهرة تحديات ومرح تجمع الكبار والصغار</p>' +
      '<div class="home-btns">' +
      (inProgress() ? '<button class="btn primary xl" data-do="resume">▶ متابعة البطولة</button>' : '') +
      '<button class="btn ' + (inProgress() ? '' : 'primary ') + 'xl" data-do="new">✨ بطولة جديدة</button>' +
      '<button class="btn" data-do="go" data-v="bank">🗂 بنك الأسئلة <small>' + bank + ' سؤالًا</small></button>' +
      '<button class="btn" data-do="go" data-v="help">📖 طريقة اللعب</button>' +
      '<button class="btn" data-do="companion">📺 شاشة التلفاز وجوال التحكم</button></div>' +
      '<p class="foot">10 فئات · 3 مستويات · من 6 إلى 10 لاعبين</p></section>';
  }

  function playersPage() {
    var f = ui.form || (ui.form = { name: '', avatar: AVATARS[S.players.length % AVATARS.length], age: 'adult', skill: 2 });
    var n = S.players.length;
    return '<section class="page">' + steps(0) + '<h2>من سيلعب الليلة؟</h2><p class="muted">أضف من 6 إلى 10 لاعبين (الحد الأدنى 2). العمر والمستوى يُستخدمان لتوزيع الفرق بعدل ولاقتراح صعوبة السؤال.</p>' +
      '<form class="card pform" data-form="player"><div class="row"><input id="pname" maxlength="16" placeholder="اسم اللاعب" value="' + esc(f.name) + '" autocomplete="off">' +
      '<button class="btn primary" type="submit">' + (ui.edit ? 'حفظ' : '+ إضافة') + '</button>' + (ui.edit ? '<button class="btn" type="button" data-do="cancelEdit">إلغاء</button>' : '') + '</div>' +
      '<div class="avatars">' + AVATARS.map(function (a) { return '<button type="button" class="' + (a === f.avatar ? 'on' : '') + '" data-do="set" data-k="form.avatar" data-v="' + a + '">' + a + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap"><label>الفئة العمرية' + seg('form.age', [['child', '🧒 طفل'], ['teen', '🧑 ناشئ'], ['adult', '🧔 بالغ']], f.age) + '</label>' +
      '<label>المستوى' + seg('form.skill', [[1, 'مبتدئ'], [2, 'متوسط'], [3, 'خبير']], f.skill) + '</label></div></form>' +
      '<div class="plist">' + S.players.map(function (p) {
        return '<div class="pcard' + (ui.edit === p.id ? ' editing' : '') + '"><i>' + esc(p.avatar) + '</i><div><b>' + esc(p.name) + '</b><small>' + AGE[p.age] + ' · ' + SKILL[p.skill] + '</small></div>' +
          '<button class="tool" title="تعديل" data-do="editPlayer" data-v="' + p.id + '">✏️</button><button class="tool" title="حذف" data-do="delPlayer" data-v="' + p.id + '">🗑</button></div>';
      }).join('') + (n ? '' : '<p class="muted empty">لا يوجد لاعبون بعد.</p>') + '</div>' +
      '<div class="nav"><button class="btn" data-do="go" data-v="home">رجوع</button>' +
      (n < 4 ? '<button class="btn" data-do="sample">⚡ تعبئة تجريبية (8 لاعبين)</button>' : '') +
      '<span class="count">' + n + ' لاعبين</span><button class="btn primary" data-do="go" data-v="settings"' + (n < 2 ? ' disabled' : '') + '>التالي ←</button></div></section>';
  }

  function settingsPage() {
    var st = S.settings, n = S.players.length;
    var maxTeams = Math.min(4, n);
    if (st.teamCount > maxTeams) st.teamCount = maxTeams;
    var tc = []; for (var i = 2; i <= maxTeams; i++) tc.push([i, i + ' فرق']);
    var comps = st.mode === 'solo' ? n : st.teamCount;
    var turns = st.format === 'knockout' ? 0 : comps * st.rounds;
    return '<section class="page">' + steps(1) + '<h2>إعدادات البطولة</h2>' +
      '<div class="card grid2">' +
      '<label>طريقة اللعب' + seg('settings.mode', [['teams', '👥 فرق'], ['solo', '🧍 فردي']], st.mode) + '</label>' +
      (st.mode === 'teams' ? '<label>عدد الفرق' + seg('settings.teamCount', tc, st.teamCount) + '</label>' : '<label>المتسابقون<div class="note">كل لاعب يتنافس باسمه (' + n + ')</div></label>') +
      '<label class="wide">نظام البطولة' + seg('settings.format', [['full', '🏆 مجموعات ثم إقصائيات'], ['league', '📊 دوري نقاط'], ['knockout', '⚔️ إقصائيات مباشرة']], st.format) +
      '<div class="note">' + ({ full: 'جولات يلعب فيها الجميع، ثم يتأهل الأفضل إلى نصف النهائي والنهائي.', league: 'جولات يلعب فيها الجميع والبطل صاحب أعلى النقاط.', knockout: 'مباريات خروج المغلوب مباشرةً حتى النهائي.' })[st.format] + '</div></label>' +
      (st.format !== 'knockout' ? '<label>عدد الجولات' + seg('settings.rounds', [[3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8']], st.rounds) + '<div class="note">' + turns + ' سؤالًا في دور المجموعات</div></label>' : '') +
      (st.format !== 'league' ? '<label>أسئلة كل طرف في المباراة' + seg('settings.matchQ', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], st.matchQ) + '</label>' : '') +
      '<label>اختيار الصعوبة' + seg('settings.diffMode', [['choice', 'الفريق يختار'], ['auto', 'تلقائي حسب اللاعب']], st.diffMode) + '</label>' +
      '<label>وقت السؤال' + seg('settings.time', [[20, 'سريع 20ث'], [30, 'عادي 30ث'], [45, 'مريح 45ث']], st.time) + '<div class="note">الأطفال يحصلون على 10 ثوانٍ إضافية</div></label>' +
      '</div><div class="card toggles">' +
      tog('steal', 'خطف السؤال', 'إذا أخطأ الفريق ينتقل السؤال للمنافس بنصف النقاط') +
      (st.format !== 'knockout' ? tog('doubleLast', 'الجولة الأخيرة مضاعفة', 'نقاط الجولة الأخيرة ×2 لإبقاء الحماس') : '') +
      (st.format !== 'league' ? tog('third', 'مباراة المركز الثالث', 'تُلعب بين خاسرَي نصف النهائي') : '') + '</div>' +
      '<h3>فئات الأسئلة <small class="muted">(' + st.cats.length + ' مختارة)</small></h3><div class="cats">' + D.CATEGORIES.map(function (c) {
        var on = st.cats.indexOf(c.id) >= 0;
        return '<button class="cat' + (on ? ' on' : '') + '" data-do="cat" data-v="' + c.id + '"><i>' + c.icon + '</i><b>' + c.name + '</b><small>' + esc(c.desc) + '</small></button>';
      }).join('') + '</div>' +
      '<div class="nav"><button class="btn" data-do="go" data-v="players">→ رجوع</button><button class="btn primary" data-do="go" data-v="teams"' + (st.cats.length ? '' : ' disabled') + '>التالي ←</button></div></section>';
  }
  function tog(k, title, desc) {
    return '<button class="toggle' + (S.settings[k] ? ' on' : '') + '" data-do="toggle" data-v="' + k + '"><span class="sw"></span><div><b>' + title + '</b><small>' + desc + '</small></div></button>';
  }

  function signature() { return S.settings.mode + '|' + S.settings.teamCount + '|' + S.players.map(function (p) { return p.id + p.age + p.skill; }).join(','); }
  function buildTeams(force) {
    var sig = signature();
    var valid = S.teams.length && ui.sig === sig;
    if (valid && !force) return;
    ui.sig = sig;
    if (S.settings.mode === 'solo') {
      S.teams = S.players.map(function (p, i) { return { id: 't' + i, name: p.name, emblem: p.avatar, color: COLORS[i % COLORS.length], members: [p.id] }; });
    } else {
      var old = S.teams;
      var groups = E.balanceTeams(S.players, S.settings.teamCount, S);
      S.teams = groups.map(function (m, i) {
        var keep = old[i] && old.length === groups.length ? old[i] : PRESETS[i];
        return { id: 't' + i, name: keep.name, emblem: keep.emblem, color: PRESETS[i].color, members: m };
      });
    }
  }
  function teamsPage() {
    buildTeams(false);
    var solo = S.settings.mode === 'solo';
    var ok = S.teams.length >= 2 && S.teams.every(function (t) { return t.members.length; });
    var body;
    if (solo) {
      body = '<div class="plist">' + S.teams.map(function (t) { return '<div class="pcard" ' + teamStyle(t) + '><i>' + esc(t.emblem) + '</i><div><b>' + esc(t.name) + '</b></div></div>'; }).join('') + '</div>';
    } else {
      body = '<div class="tgrid">' + S.teams.map(function (t, ti) {
        var w = t.members.reduce(function (s, id) { return s + E.weight(player(id)); }, 0);
        return '<div class="tcard" ' + teamStyle(t) + '><div class="thead"><button class="temblem" data-do="emblem" data-v="' + ti + '" title="غيّر الشعار">' + esc(t.emblem) + '</button>' +
          '<input class="tname" maxlength="14" data-team="' + ti + '" value="' + esc(t.name) + '"></div>' +
          '<div class="strength" title="قوة الفريق التقديرية">القوة <b>' + w + '</b></div>' +
          '<div class="tmembers">' + t.members.map(function (id) {
            var p = player(id);
            return '<button class="member" data-do="move" data-v="' + id + '" title="انقل إلى الفريق التالي"><i>' + esc(p.avatar) + '</i>' + esc(p.name) + '<small>' + AGE[p.age] + '</small></button>';
          }).join('') + (t.members.length ? '' : '<p class="muted">فريق فارغ!</p>') + '</div></div>';
      }).join('') + '</div><p class="muted">التوزيع يوازن الأعمار والمستويات تلقائيًا. اضغط على لاعب لنقله إلى الفريق التالي، أو عدّل اسم الفريق وشعاره.</p>';
    }
    return '<section class="page">' + steps(2) + '<h2>' + (solo ? 'المتسابقون جاهزون' : 'الفرق المتوازنة') + '</h2>' + body +
      '<div class="nav"><button class="btn" data-do="go" data-v="settings">→ رجوع</button>' + (solo ? '' : '<button class="btn" data-do="rebalance">🎲 أعد التوزيع</button>') +
      '<button class="btn primary xl" data-do="start"' + (ok ? '' : ' disabled') + '>🚀 ابدأ البطولة</button></div></section>';
  }

  function helpPage() {
    return '<section class="page help"><h2>📖 طريقة اللعب</h2><div class="card">' +
      '<h3>الفكرة</h3><p>شخص واحد هو <b>المقدّم</b> يتحكم باللعبة من هذا الجهاز (أو من جواله)، والشاشة تُعرض على التلفاز. يتناوب الفرق على الإجابة، ولكل دور لاعب محدد يجيب بالتناوب حتى يشارك الجميع، صغارًا وكبارًا.</p>' +
      '<h3>النقاط</h3><p>سهل = 10 · متوسط = 20 · صعب = 30. إذا أخطأ الفريق فللمنافس فرصة <b>خطف</b> السؤال بنصف النقاط. الجولة الأخيرة مضاعفة.</p>' +
      '<h3>أنواع التحديات</h3><ul><li><b>أسئلة الاختيارات:</b> يضغط المقدّم على الخيار الذي اختاره الفريق وتُحتسب النقاط تلقائيًا.</li>' +
      '<li><b>تمثيل صامت:</b> يطّلع الممثل وحده على الكلمة (زر «أظهر الكلمة» أو من جوال المقدّم) ثم يبدأ الوقت، ويحكم المقدّم.</li>' +
      '<li><b>ذاكرة:</b> تُعرض عناصر لثوانٍ ثم تختفي ويُطرح سؤال عنها.</li><li><b>قوة الملاحظة:</b> لوحة رموز وسؤال عنها قبل انتهاء الوقت.</li>' +
      '<li><b>تحديات حركية:</b> تحدٍّ آمن ومرح يحكم المقدّم على نجاحه.</li></ul>' +
      '<h3>التعادل</h3><p>يُكسر تلقائيًا بعدد الإجابات الصحيحة ثم الأسئلة الصعبة ثم الأخطاء الأقل، وإن بقي التعادل يُطرح <b>سؤال الحسم</b>: الأسرع إجابةً يفوز.</p>' +
      '<h3>اختصارات لوحة المفاتيح</h3><p><kbd>مسافة</kbd> التالي · <kbd>1-4</kbd> اختيار إجابة/مستوى · <kbd>C</kbd> صحيحة · <kbd>X</kbd> خاطئة · <kbd>P</kbd> إيقاف المؤقت · <kbd>U</kbd> تراجع · <kbd>F</kbd> ملء الشاشة · <kbd>M</kbd> الصوت</p>' +
      '</div><div class="nav"><button class="btn primary" data-do="go" data-v="home">رجوع</button></div></section>';
  }

  function bankPage() {
    var bank = E.getBank(), custom = customQs();
    var f = ui.qform || (ui.qform = { cat: 'general', diff: 'easy', type: 'mcq', q: '', o: ['', '', '', ''], correct: 0, answer: '', word: '', seconds: 30, exp: '' });
    var table = '<table class="btable"><tr><th>الفئة</th><th>سهل</th><th>متوسط</th><th>صعب</th><th>المجموع</th></tr>' + D.CATEGORIES.map(function (c) {
      var cnt = E.DIFFS.map(function (d) { return bank.filter(function (q) { return q.cat === c.id && q.diff === d; }).length; });
      return '<tr><td>' + c.icon + ' ' + c.name + '</td><td>' + cnt[0] + '</td><td>' + cnt[1] + '</td><td>' + cnt[2] + '</td><td><b>' + (cnt[0] + cnt[1] + cnt[2]) + '</b></td></tr>';
    }).join('') + '</table>';
    var typeFields = f.type === 'mcq' ? '<div class="qopts">' + f.o.map(function (o, i) {
      return '<label class="qopt"><input type="radio" name="correct" value="' + i + '"' + (f.correct === i ? ' checked' : '') + ' data-q="correct"><input placeholder="الخيار ' + LET[i] + (i > 1 ? ' (اختياري)' : '') + '" value="' + esc(o) + '" data-q="o' + i + '"></label>';
    }).join('') + '<small class="muted">حدّد الدائرة بجانب الإجابة الصحيحة.</small></div>'
      : f.type === 'open' ? '<input placeholder="الإجابة المقبولة" value="' + esc(f.answer) + '" data-q="answer">'
        : f.type === 'charades' ? '<input placeholder="الكلمة أو العبارة المطلوب تمثيلها" value="' + esc(f.word) + '" data-q="word">'
          : '<label class="inline">مدة التحدي بالثواني <input type="number" min="5" max="180" value="' + f.seconds + '" data-q="seconds"></label>';
    return '<section class="page"><h2>🗂 بنك الأسئلة</h2><p class="muted">' + bank.length + ' سؤالًا وتحديًا (' + custom.length + ' منها من إضافتك). لا يتكرر أي سؤال داخل البطولة الواحدة.</p>' +
      '<div class="card">' + table + '</div>' +
      '<form class="card qform" data-form="question"><h3>أضف سؤالك الخاص</h3><div class="row wrap">' +
      '<label>الفئة<select data-q="cat">' + D.CATEGORIES.map(function (c) { return '<option value="' + c.id + '"' + (f.cat === c.id ? ' selected' : '') + '>' + c.name + '</option>'; }).join('') + '</select></label>' +
      '<label>المستوى<select data-q="diff">' + E.DIFFS.map(function (d) { return '<option value="' + d + '"' + (f.diff === d ? ' selected' : '') + '>' + DIFF[d] + '</option>'; }).join('') + '</select></label>' +
      '<label>النوع<select data-q="type" data-rerender="1">' + [['mcq', 'اختيارات'], ['open', 'إجابة مفتوحة'], ['charades', 'تمثيل صامت'], ['physical', 'تحدٍّ حركي']].map(function (t) { return '<option value="' + t[0] + '"' + (f.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label></div>' +
      (f.type === 'charades' ? '' : '<textarea rows="2" placeholder="' + (f.type === 'physical' ? 'وصف التحدي' : 'نص السؤال') + '" data-q="q">' + esc(f.q) + '</textarea>') + typeFields +
      (f.type === 'charades' ? '' : '<input placeholder="شرح أو معلومة إضافية (اختياري)" value="' + esc(f.exp) + '" data-q="exp">') +
      (ui.bankMsg ? '<div class="msg ' + ui.bankMsg.c + '">' + ui.bankMsg.t + '</div>' : '') +
      '<div class="row"><button class="btn primary" type="submit">+ أضف السؤال</button></div></form>' +
      '<div class="card"><h3>أسئلتك (' + custom.length + ')</h3>' + (custom.length ? custom.map(function (q) {
        return '<div class="cq"><span class="tag">' + (CAT[q.cat] ? CAT[q.cat].icon : '') + ' ' + DIFF[q.diff] + '</span><p>' + esc(q.type === 'charades' ? '🎭 ' + q.word : q.q) + '</p><button class="tool" data-do="delQ" data-v="' + esc(q.id) + '">🗑</button></div>';
      }).join('') : '<p class="muted">لم تُضف أسئلة بعد.</p>') +
      '<div class="row wrap"><button class="btn" data-do="exportQ"' + (custom.length ? '' : ' disabled') + '>⬇ تصدير JSON</button><label class="btn filebtn">⬆ استيراد JSON<input type="file" accept=".json,application/json" id="importQ" hidden></label></div></div>' +
      '<div class="nav"><button class="btn primary" data-do="go" data-v="home">رجوع</button></div></section>';
  }

  function renderSetup() {
    var pages = { home: homePage, players: playersPage, settings: settingsPage, teams: teamsPage, help: helpPage, bank: bankPage };
    $('#setup').innerHTML = (pages[ui.page] || homePage)();
  }

  /* ── نوافذ ── */
  function modal(html) { var m = $('#modal'); m.innerHTML = '<div class="mbox">' + html + '<div class="row end"><button class="btn primary" data-do="closeModal">إغلاق</button></div></div>'; m.hidden = false; }
  function closeModal() { $('#modal').hidden = true; ui.modal = null; }
  function companionHTML() {
    var base = location.href.split('?')[0].split('#')[0];
    var lan = serverUrls[0];
    return '<h2>📺 الشاشات المرافقة</h2>' +
      '<p><b>نافذة التلفاز:</b> افتحها واسحبها إلى شاشة التلفاز (HDMI أو بث لاسلكي)، وأبقِ هذه النافذة أمامك للتحكم.</p>' +
      '<div class="row wrap"><a class="btn primary" target="_blank" rel="noopener" href="' + base + '?view=tv">افتح نافذة التلفاز ↗</a><a class="btn" target="_blank" rel="noopener" href="' + base + '?view=remote">افتح لوحة تحكم إضافية ↗</a></div>' +
      (server ? '<h3>من جهاز آخر على الشبكة نفسها</h3>' + (lan ? '<p>للتلفاز الذكي:</p><code>' + lan + '?view=tv</code><p>لجوال المقدّم (تظهر فيه الإجابات سرًّا):</p><code>' + lan + '?view=remote</code>' : '<p class="muted">لم يُعثر على عنوان شبكة محلية.</p>')
        : '<h3>التحكم من الجوال</h3><p class="muted">لربط جوال أو تلفاز ذكي عبر الواي فاي شغّل الخادم المرفق: <code>node server.js</code> ثم افتح العنوان الذي يظهر. بدون الخادم تعمل الشاشات المرافقة على هذا الجهاز فقط.</p>');
  }

  /* ════════ العرض الرئيسي ════════ */
  function render() {
    document.body.dataset.view = VIEW;
    document.body.dataset.page = VIEW === 'host' ? ui.page : VIEW;
    var game = (VIEW === 'host' && ui.page === 'game') || VIEW === 'tv';
    $('#setup').hidden = !(VIEW === 'host' && ui.page !== 'game');
    $('#game').hidden = !game;
    $('#remote').hidden = VIEW !== 'remote';
    if (VIEW === 'remote') return renderRemote();
    if (!game) { lastKey = null; confetti(0); return renderSetup(); }
    if (!S) S = { screen: 'setup', players: [], page: 'home' };
    renderStage();
    if (VIEW === 'host') renderDock();
    if (ui.modal === 'scores') modal('<h2>± تعديل النقاط</h2>' + adjustRows());
  }

  /* ════════ الأحداث ════════ */
  function setPath(k, v) {
    var parts = k.split('.'), o = parts[0] === 'form' ? ui.form : S.settings;
    var cur = o[parts[1]];
    o[parts[1]] = typeof cur === 'number' ? Number(v) : v;
  }
  function go(page) {
    if (ui.page === 'game' && page !== 'game' && S.timer && S.timer.running) E.act(S, { type: 'TIMER', op: 'pause' }, Date.now());
    ui.page = page; ui.bankMsg = null;
    commit(); window.scrollTo(0, 0);
  }
  function resetTournament(keepTeams) {
    var fresh = E.newState();
    fresh.players = S.players.map(function (p) { return { id: p.id, name: p.name, avatar: p.avatar, age: p.age, skill: p.skill }; });
    fresh.settings = S.settings;
    if (keepTeams) fresh.teams = S.teams.map(function (t) { return { id: t.id, name: t.name, emblem: t.emblem, color: t.color, members: t.members }; });
    else ui.sig = '';
    S = fresh; undo = []; shown = {};
  }
  var DO = {
    go: function (v) { go(v); },
    resume: function () { go('game'); },
    'new': function () {
      if (inProgress() && !confirm('سيتم إنهاء البطولة الحالية وبدء بطولة جديدة. متابعة؟')) return;
      resetTournament(false); go('players');
    },
    newGame: function () { resetTournament(false); go('players'); },
    rematch: function () { resetTournament(true); loadBank(); dispatch({ type: 'START' }); },
    home: function () { go('home'); },
    set: function (v, el) { setPath(el.dataset.k, v); if (ui.page === 'players') { var n = $('#pname'); if (n) ui.form.name = n.value; } commit(); },
    toggle: function (v) { S.settings[v] = !S.settings[v]; commit(); },
    cat: function (v) { var c = S.settings.cats, i = c.indexOf(v); if (i >= 0) c.splice(i, 1); else c.push(v); commit(); },
    sample: function () {
      SAMPLE.forEach(function (s, i) { S.players.push({ id: uid('p') + i, name: s[0], avatar: s[1], age: s[2], skill: s[3] }); });
      commit();
    },
    editPlayer: function (v) { var p = player(v); ui.edit = v; ui.form = { name: p.name, avatar: p.avatar, age: p.age, skill: p.skill }; commit(); window.scrollTo(0, 0); },
    cancelEdit: function () { ui.edit = null; ui.form = null; commit(); },
    delPlayer: function (v) { S.players = S.players.filter(function (p) { return p.id !== v; }); if (ui.edit === v) { ui.edit = null; ui.form = null; } commit(); },
    rebalance: function () { buildTeams(true); commit(); },
    move: function (v) {
      var from = -1; S.teams.forEach(function (t, i) { if (t.members.indexOf(v) >= 0) from = i; });
      var t = S.teams[from]; t.members.splice(t.members.indexOf(v), 1);
      S.teams[(from + 1) % S.teams.length].members.push(v); commit();
    },
    emblem: function (v) {
      var list = ['🦅', '🌟', '🦁', '🐎', '🐺', '🐉', '🚀', '⚡', '🔥', '🐬', '🦊', '👑'], t = S.teams[+v];
      t.emblem = list[(list.indexOf(t.emblem) + 1) % list.length]; commit();
    },
    start: function () {
      $$('.tname').forEach(function (inp) { var t = S.teams[+inp.dataset.team]; if (t && inp.value.trim()) t.name = inp.value.trim(); });
      loadBank(); undo = []; shown = {};
      Sound.unlock();
      ui.page = 'game';
      if (E.act(S, { type: 'START' }, Date.now()) === false) { ui.page = 'teams'; toast('تعذر بدء البطولة: تحقق من الفرق والفئات'); }
      commit();
    },
    peek: function () { ui.peek = !ui.peek; render(); },
    scores: function () { ui.modal = 'scores'; render(); },
    sound: function () { Sound.toggle(); render(); },
    tv: function () { toggleTV(); },
    companion: function () { modal(companionHTML()); },
    closeModal: function () { closeModal(); },
    delQ: function (v) { store('fg-custom', customQs().filter(function (q) { return q.id !== v; })); loadBank(); render(); },
    exportQ: function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(customQs(), null, 2)], { type: 'application/json' }));
      a.download = 'family-questions.json'; a.click();
    }
  };
  function toggleTV() {
    var on = !document.body.classList.contains('tvmode');
    document.body.classList.toggle('tvmode', on);
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (on) toast('وضع التلفاز: حرّك الفأرة لإظهار لوحة التحكم، أو استخدم لوحة المفاتيح');
  }
  function addQuestion(q, list) {
    var errs = E.validateQuestion(q);
    var key = q.type === 'charades' ? E.norm(q.word) : E.norm(q.q);
    var dup = E.getBank().concat(list || []).some(function (x) { return (x.type === 'charades' ? E.norm(x.word) : E.norm(x.q)) === key && x.type !== 'visual' && x.type !== 'memory'; });
    if (dup) errs.push('هذا السؤال موجود مسبقًا في البنك');
    return errs;
  }
  function cleanQ(raw) {
    var q = { id: uid('c'), cat: raw.cat, diff: raw.diff, type: raw.type, q: String(raw.q || '').trim(), exp: String(raw.exp || '').trim(), custom: true };
    if (q.type === 'mcq') { q.options = (raw.options || []).map(function (o) { return String(o).trim(); }); q.answer = Number(raw.answer); }
    else if (q.type === 'open') q.answer = String(raw.answer || '').trim();
    else if (q.type === 'charades') { q.word = String(raw.word || '').trim(); q.hint = raw.hint || 'من إضافتك'; q.q = 'مثّل لفريقك دون كلام'; }
    else if (q.type === 'physical') q.seconds = Number(raw.seconds);
    return q;
  }
  function submitQuestion() {
    var f = ui.qform, raw = { cat: f.cat, diff: f.diff, type: f.type, q: f.q, exp: f.exp, answer: f.answer, word: f.word, seconds: f.seconds };
    if (f.type === 'mcq') {
      var opts = [], ans = -1;
      f.o.forEach(function (o, i) { if (o.trim()) { if (i === f.correct) ans = opts.length; opts.push(o); } });
      raw.options = opts; raw.answer = ans;
    }
    var q = cleanQ(raw), errs = addQuestion(q);
    if (errs.length) { ui.bankMsg = { c: 'err', t: '⚠️ ' + errs.map(esc).join(' · ') }; return render(); }
    store('fg-custom', customQs().concat([q])); loadBank();
    ui.qform = { cat: f.cat, diff: f.diff, type: f.type, q: '', o: ['', '', '', ''], correct: 0, answer: '', word: '', seconds: 30, exp: '' };
    ui.bankMsg = { c: 'ok', t: '✅ أُضيف السؤال بعد التحقق منه' };
    render();
  }
  function importQuestions(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var arr; try { arr = JSON.parse(rd.result); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) { ui.bankMsg = { c: 'err', t: '⚠️ الملف ليس قائمة أسئلة JSON صالحة' }; return render(); }
      var added = [], bad = 0;
      arr.forEach(function (raw) {
        if (!raw || ['mcq', 'open', 'charades', 'physical'].indexOf(raw.type) < 0) { bad++; return; }
        var q = cleanQ(raw);
        if (addQuestion(q, added).length) bad++; else added.push(q);
      });
      store('fg-custom', customQs().concat(added)); loadBank();
      ui.bankMsg = { c: bad ? 'err' : 'ok', t: 'أُضيف ' + added.length + ' سؤالًا' + (bad ? ' ورُفض ' + bad + ' لعدم اجتيازه التحقق' : '') };
      render();
    };
    rd.readAsText(file);
  }

  document.addEventListener('click', function (ev) {
    Sound.unlock();
    var el = ev.target.closest('[data-act],[data-do]');
    if (!el || el.disabled) return;
    if (el.dataset.act) {
      if (VIEW === 'tv') return;
      return dispatch(JSON.parse(el.dataset.act));
    }
    var fn = DO[el.dataset.do];
    if (fn) fn(el.dataset.v, el);
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var kind = ev.target.dataset.form;
    if (kind === 'player') {
      var name = $('#pname').value.trim();
      if (!name) return toast('اكتب اسم اللاعب أولًا');
      if (!ui.edit && S.players.length >= 16) return toast('الحد الأقصى 16 لاعبًا');
      if (S.players.some(function (p) { return p.name === name && p.id !== ui.edit; })) return toast('هذا الاسم مستخدم — اختر اسمًا مميزًا');
      var f = ui.form;
      if (ui.edit) { var p = player(ui.edit); p.name = name; p.avatar = f.avatar; p.age = f.age; p.skill = f.skill; }
      else S.players.push({ id: uid('p'), name: name, avatar: f.avatar, age: f.age, skill: f.skill });
      ui.edit = null; ui.form = null;
      commit();
      var inp = $('#pname'); if (inp) inp.focus();
    } else if (kind === 'question') submitQuestion();
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'pname' && ui.form) ui.form.name = el.value;
    if (el.dataset.team != null) { var t = S.teams[+el.dataset.team]; if (t && el.value.trim()) { t.name = el.value.trim(); save(); } }
    if (el.dataset.q && ui.qform) {
      var k = el.dataset.q, f = ui.qform;
      if (k === 'correct') f.correct = +el.value;
      else if (/^o\d$/.test(k)) f.o[+k[1]] = el.value;
      else if (k === 'seconds') f.seconds = +el.value;
      else f[k] = el.value;
      if (el.dataset.rerender) { ui.bankMsg = null; render(); }
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'importQ' && ev.target.files[0]) importQuestions(ev.target.files[0]);
  });
  document.addEventListener('keydown', function (ev) {
    if (VIEW !== 'host' || ui.page !== 'game' || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var k = ev.key.toLowerCase(), T = S.turn, B = controls();
    if (k === 'escape') return closeModal();
    if (!$('#modal').hidden) return;
    if (k === ' ' || k === 'enter') { ev.preventDefault(); var p = B.filter(function (b) { return /primary/.test(b.c || ''); })[0]; dispatch(p ? p.a : { type: 'NEXT' }); return; }
    if (/^[1-4]$/.test(k)) { var b = B.filter(function (x) { return String(x.k) === k && !x.dis; })[0]; if (b) dispatch(b.a); return; }
    if ((k === 'c' || k === 'ؤ') && T && T.q && !T.q.options && (T.phase === 'question' || T.phase === 'steal')) return dispatch({ type: 'JUDGE', ok: true });
    if ((k === 'x' || k === 'ء') && T && (T.phase === 'question' || T.phase === 'steal')) return dispatch({ type: 'JUDGE', ok: false });
    if ((k === 'p' || k === 'ح') && S.timer) return dispatch({ type: 'TIMER', op: S.timer.running ? 'pause' : 'resume' });
    if (k === 'u' || k === 'ع') return dispatch({ type: 'UNDO' });
    if (k === 'f' || k === 'ب') return toggleTV();
    if (k === 'm' || k === 'ة') { Sound.toggle(); render(); }
  });
  var idle;
  document.addEventListener('mousemove', function () {
    document.body.classList.add('dock-show');
    clearTimeout(idle); idle = setTimeout(function () { document.body.classList.remove('dock-show'); }, 3500);
  });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) document.body.classList.remove('tvmode'); });
  window.addEventListener('resize', function () { if (!$('#game').hidden) fit(); var cv = $('#fx'); if (cv && cf.parts.length) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; } });

  /* ════════ الإقلاع ════════ */
  function boot() {
    loadBank();
    if (VIEW === 'host') {
      var saved = store('fg-state');
      S = saved && saved.v === 1 ? saved : E.newState();
      if (!S.settings.cats || !S.settings.cats.length) S.settings.cats = D.CATEGORIES.map(function (c) { return c.id; });
      if (S.teams.length) ui.sig = signature();
    }
    render();
    connect();
    setInterval(tick, 100);
    window.FG = { get S() { return S; }, dispatch: dispatch, ui: ui, view: VIEW };
  }
  boot();
})();
