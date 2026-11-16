/* محرك البطولة — pure tournament logic (no DOM). Browser: window.FGEngine, Node: module.exports */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FGEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POINTS = { easy: 10, medium: 20, hard: 30 };
  var DIFFS = ['easy', 'medium', 'hard'];
  var AGE_W = { child: 1, teen: 2, adult: 3 };
  var MCQ_TYPES = { mcq: 1, visual: 1, memory: 1 };
  var BANK = [];
  var CATS = [];

  function setBank(questions, categories) { BANK = questions.slice(); if (categories) CATS = categories.slice(); }
  function getBank() { return BANK; }

  /* ── عشوائية قابلة للإعادة ── */
  function rand(S) {
    S.seed = (S.seed + 0x6D2B79F5) >>> 0;
    var t = S.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(arr, S) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(S) * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }

  function defaultSettings() {
    return {
      mode: 'teams',        // teams | solo
      teamCount: 2,
      format: 'full',       // full (دوري + إقصائيات) | league | knockout
      rounds: 4,
      cats: [],             // filled by app (all categories)
      diffMode: 'choice',   // choice | auto
      time: 30,             // ثواني السؤال العادي
      steal: true,
      doubleLast: true,
      third: true,
      matchQ: 3             // أسئلة لكل طرف في المباراة الإقصائية
    };
  }

  function newState(seed) {
    return {
      v: 1, screen: 'setup', seed: (seed == null ? Math.floor(Math.random() * 4294967296) : seed) >>> 0,
      players: [], settings: defaultSettings(), teams: [], used: [], t: null, turn: null, timer: null,
      tb: null, intro: null, turnCount: 0, result: null
    };
  }

  /* ── توزيع الفرق المتوازن ── */
  function weight(p) { return AGE_W[p.age] * 2 + (p.skill || 2); }
  function teamWeight(team) { return team.reduce(function (s, p) { return s + weight(p); }, 0); }

  function balanceTeams(players, n, S) {
    var teams = [], i;
    for (i = 0; i < n; i++) teams.push([]);
    ['adult', 'teen', 'child'].forEach(function (age) {
      var group = shuffle(players.filter(function (p) { return p.age === age; }), S)
        .sort(function (a, b) { return (b.skill || 2) - (a.skill || 2); });
      group.forEach(function (p) {
        var best = null, bestKey = null;
        teams.forEach(function (t, idx) {
          var key = [t.filter(function (x) { return x.age === age; }).length, t.length, teamWeight(t), idx];
          if (!best || cmpKey(key, bestKey) < 0) { best = t; bestKey = key; }
        });
        best.push(p);
      });
    });
    // ضمان تقارب الأحجام
    var guard = 0;
    while (guard++ < 50) {
      var big = teams.slice().sort(function (a, b) { return b.length - a.length; })[0];
      var small = teams.slice().sort(function (a, b) { return a.length - b.length; })[0];
      if (big.length - small.length <= 1) break;
      var mv = big.slice().sort(function (a, b) { return weight(a) - weight(b); })[0];
      big.splice(big.indexOf(mv), 1); small.push(mv);
    }
    // تحسين بالتبديل بين لاعبين من الفئة العمرية نفسها
    var improved = true; guard = 0;
    while (improved && guard++ < 100) {
      improved = false;
      for (var a = 0; a < n && !improved; a++) for (var b = a + 1; b < n && !improved; b++) {
        for (var x = 0; x < teams[a].length && !improved; x++) for (var y = 0; y < teams[b].length && !improved; y++) {
          var pa = teams[a][x], pb = teams[b][y];
          if (pa.age !== pb.age) continue;
          var before = spread(teams);
          teams[a][x] = pb; teams[b][y] = pa;
          if (spread(teams) < before) improved = true;
          else { teams[a][x] = pa; teams[b][y] = pb; }
        }
      }
    }
    return teams.map(function (t) { return t.map(function (p) { return p.id; }); });
  }
  function cmpKey(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; }
  function spread(teams) {
    var w = teams.map(teamWeight);
    return Math.max.apply(null, w) - Math.min.apply(null, w);
  }

  /* ── التحقق من الأسئلة ── */
  function norm(s) {
    return String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[؟?!.،,:«»"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function validateQuestion(q, cats) {
    var errs = [];
    cats = cats || CATS;
    if (!q || typeof q !== 'object') return ['سؤال غير صالح'];
    if (cats.length && !cats.some(function (c) { return c.id === q.cat; })) errs.push('الفئة غير معروفة');
    if (DIFFS.indexOf(q.diff) < 0) errs.push('مستوى الصعوبة غير صالح');
    if (!q.q || norm(q.q).length < 5) errs.push('نص السؤال قصير جدًا');
    if (MCQ_TYPES[q.type]) {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) errs.push('يجب أن يكون عدد الخيارات بين 2 و4');
      else {
        var seen = {};
        q.options.forEach(function (o) {
          var k = norm(o);
          if (!k) errs.push('يوجد خيار فارغ');
          else if (seen[k]) errs.push('يوجد خيار مكرر: ' + o);
          seen[k] = 1;
        });
        if (!(q.answer >= 0 && q.answer < q.options.length) || q.answer !== Math.floor(q.answer)) errs.push('لم تُحدَّد الإجابة الصحيحة');
      }
    } else if (q.type === 'open') {
      if (!q.answer || !norm(q.answer)) errs.push('الإجابة المقبولة مطلوبة');
    } else if (q.type === 'charades') {
      if (!q.word || !norm(q.word)) errs.push('كلمة التمثيل مطلوبة');
    } else if (q.type === 'physical') {
      if (!(q.seconds >= 5 && q.seconds <= 180)) errs.push('مدة التحدي يجب أن تكون بين 5 و180 ثانية');
    } else errs.push('نوع السؤال غير معروف');
    return errs;
  }
  function validateBank(list, cats) {
    var out = [], seen = {}, ids = {};
    list.forEach(function (q) {
      var errs = validateQuestion(q, cats);
      if (q && q.type !== 'visual' && q.type !== 'memory') {
        var kk = q.type === 'charades' ? 'ch:' + norm(q.word) : norm(q.q);
        if (seen[kk]) errs.push('سؤال مكرر');
        seen[kk] = 1;
      }
      if (q && ids[q.id]) errs.push('معرّف مكرر');
      if (q) ids[q.id] = 1;
      if (errs.length) out.push({ id: q && q.id, errors: errs });
    });
    return out;
  }

  /* ── أدوات ── */
  function team(S, id) { for (var i = 0; i < S.teams.length; i++) if (S.teams[i].id === id) return S.teams[i]; return null; }
  function player(S, id) { for (var i = 0; i < S.players.length; i++) if (S.players[i].id === id) return S.players[i]; return null; }
  function cmpTeams(a, b) {
    return (b.score - a.score) || (b.correct - a.correct) || (b.hard - a.hard) || (a.wrong - b.wrong) || (b.tb - a.tb);
  }
  function equalRank(a, b) { return cmpTeams(a, b) === 0; }
  function standings(S) {
    return S.teams.map(function (t, i) { return { t: t, i: i }; })
      .sort(function (x, y) { return cmpTeams(x.t, y.t) || (x.i - y.i); })
      .map(function (x) { return x.t; });
  }
  function recommend(p) {
    if (!p) return 'medium';
    var s = p.skill || 2;
    if (p.age === 'child') return s >= 3 ? 'medium' : 'easy';
    if (p.age === 'teen') return s <= 1 ? 'easy' : 'medium';
    return s >= 3 ? 'hard' : 'medium';
  }

  /* ── سحب الأسئلة دون تكرار ── */
  function draw(S, cat, diff, filter) {
    var pool = BANK.filter(function (q) { return S.used.indexOf(q.id) < 0 && (!filter || filter(q)); });
    var order = diff === 'easy' ? ['easy', 'medium', 'hard'] : diff === 'hard' ? ['hard', 'medium', 'easy'] : ['medium', 'easy', 'hard'];
    var c = [], i;
    for (i = 0; i < 3 && !c.length; i++) c = pool.filter(function (q) { return q.cat === cat && q.diff === order[i]; });
    for (i = 0; i < 3 && !c.length; i++) c = pool.filter(function (q) { return S.settings.cats.indexOf(q.cat) >= 0 && q.diff === order[i]; });
    if (!c.length) c = pool;
    if (!c.length) {
      if (!S.used.length) return null;
      var any = BANK.some(function (q) { return !filter || filter(q); });
      if (!any) return null;
      S.used = []; S.recycled = true;      // استُنفد البنك كله: يُسمح بالتكرار اضطرارًا
      return draw(S, cat, diff, filter);
    }
    var q = c[Math.floor(rand(S) * c.length)];
    S.used.push(q.id);
    return q;
  }
  function prepare(q, S) {
    var c = JSON.parse(JSON.stringify(q));
    delete c.spec;
    if (MCQ_TYPES[c.type] && c.options) {
      var idx = shuffle(c.options.map(function (_, i) { return i; }), S);
      c.options = idx.map(function (i) { return q.options[i]; });
      c.answer = idx.indexOf(q.answer);
    }
    return c;
  }

  /* ── المؤقت ── */
  function startTimer(S, secs, now, delayMs) {
    S.timer = { dur: secs, endsAt: now + (delayMs || 0) + secs * 1000, running: true, left: secs * 1000 };
  }
  function freezeTimer(S, now) {
    if (S.timer && S.timer.running) { S.timer.left = Math.max(0, Math.min(S.timer.dur * 1000, S.timer.endsAt - now)); S.timer.running = false; }
  }
  function timerOp(S, op, now) {
    var T = S.timer; if (!T) return false;
    if (op === 'pause' && T.running) freezeTimer(S, now);
    else if (op === 'resume' && !T.running) { T.endsAt = now + T.left; T.running = true; }
    else if (op === 'add') { if (T.running) T.endsAt += 10000; else T.left += 10000; T.dur += 10; }
    else return false;
  }

  /* ── بدء البطولة ── */
  function start(S) {
    var st = S.settings;
    if (S.teams.length < 2) return false;
    if (!st.cats.length) return false;
    S.teams.forEach(function (t) {
      t.score = 0; t.total = 0; t.correct = 0; t.wrong = 0; t.hard = 0; t.steals = 0; t.tb = 0; t.rot = 0;
    });
    S.players.forEach(function (p) { p.correct = 0; p.wrong = 0; p.points = 0; });
    S.used = []; S.turnCount = 0; S.turn = null; S.timer = null; S.tb = null; S.result = null; S.recycled = false;
    var rounds = Math.max(1, st.rounds | 0);
    var roundCats = [], bag = [];
    while (roundCats.length < rounds) { if (!bag.length) bag = shuffle(st.cats, S); roundCats.push(bag.pop()); }
    S.t = {
      stage: st.format === 'knockout' ? 'bracket' : 'group',
      round: 0, rounds: rounds, roundCats: roundCats, turnIdx: 0,
      order: shuffle(S.teams.map(function (t) { return t.id; }), S),
      prevScores: {}, bracket: null, cur: null, catBag: [], groupDone: false
    };
    S.intro = { idx: 0, count: st.mode === 'solo' ? 1 : S.teams.length };
    S.screen = 'intro';
  }

  function beginStage(S) {
    if (S.t.stage === 'group') { startRound(S); }
    else { buildBracket(S, shuffle(S.teams.map(function (t) { return t.id; }), S)); S.screen = 'bracket'; }
  }
  function startRound(S) {
    var t = S.t; t.turnIdx = 0; t.prevScores = {};
    S.teams.forEach(function (x) { t.prevScores[x.id] = x.score; });
    S.screen = 'roundIntro';
  }

  /* ── شجرة الإقصائيات ── */
  function seedOrder(size) {
    var o = [1, 2];
    while (o.length < size) {
      var n = o.length * 2, nx = [];
      o.forEach(function (s) { nx.push(s, n + 1 - s); });
      o = nx;
    }
    return o;
  }
  function buildBracket(S, seeds) {
    var n = seeds.length, size = 2;
    while (size < n) size *= 2;
    var order = seedOrder(size), rounds = [], r, m, id = 0;
    var first = [];
    for (m = 0; m < size / 2; m++) {
      first.push(mkMatch(++id, seeds[order[m * 2] - 1] || null, seeds[order[m * 2 + 1] - 1] || null));
    }
    rounds.push(first);
    for (r = size / 4; r >= 1; r /= 2) {
      var list = [];
      for (m = 0; m < r; m++) list.push(mkMatch(++id, null, null));
      rounds.push(list);
    }
    S.t.bracket = { rounds: rounds, third: null, seeds: seeds.slice(), champion: null };
    S.t.stage = 'bracket';
    // الإعفاءات (bye)
    first.forEach(function (mt, i) {
      if (!mt.a || !mt.b) { mt.bye = true; mt.done = true; mt.winner = mt.a || mt.b; propagate(S, 0, i); }
    });
  }
  function mkMatch(id, a, b) { return { id: id, a: a, b: b, sa: 0, sb: 0, winner: null, done: false, bye: false, turn: 0, cat: null, tb: false }; }
  function propagate(S, r, i) {
    var br = S.t.bracket, m = br.rounds[r][i];
    if (r + 1 < br.rounds.length) {
      var nx = br.rounds[r + 1][Math.floor(i / 2)];
      if (i % 2 === 0) nx.a = m.winner; else nx.b = m.winner;
    } else br.champion = m.winner;
    // مباراة المركز الثالث
    if (S.settings.third && br.rounds.length >= 2 && r === br.rounds.length - 2) {
      var semis = br.rounds[r];
      if (semis.every(function (x) { return x.done && !x.bye; })) {
        br.third = mkMatch(99, semis[0].winner === semis[0].a ? semis[0].b : semis[0].a, semis[1].winner === semis[1].a ? semis[1].b : semis[1].a);
      }
    }
  }
  function nextMatch(S) {
    var br = S.t.bracket, r, i, last = br.rounds.length - 1;
    for (r = 0; r < last; r++) for (i = 0; i < br.rounds[r].length; i++) {
      var m = br.rounds[r][i];
      if (!m.done && m.a && m.b) return { r: r, i: i };
    }
    if (br.third && !br.third.done) return { third: true };
    var f = br.rounds[last][0];
    if (!f.done && f.a && f.b) return { r: last, i: 0 };
    return null;
  }
  function curMatch(S) {
    var c = S.t.cur; if (!c) return null;
    return c.third ? S.t.bracket.third : S.t.bracket.rounds[c.r][c.i];
  }
  function roundName(S, cur) {
    if (!cur) return '';
    if (cur.third) return 'مباراة المركز الثالث';
    var fromEnd = S.t.bracket.rounds.length - 1 - cur.r;
    return ['النهائي', 'نصف النهائي', 'ربع النهائي', 'دور الـ16'][fromEnd] || 'الدور ' + (cur.r + 1);
  }
  function nextCat(S) {
    var t = S.t;
    if (!t.catBag.length) t.catBag = shuffle(S.settings.cats, S);
    return t.catBag.pop();
  }

  /* ── الأدوار ── */
  function startTurn(S) {
    var t = S.t, teamId, cat, mult = 1, ctx;
    if (t.stage === 'group') {
      ctx = 'group';
      var n = t.order.length;
      teamId = t.order[(t.round + t.turnIdx) % n];
      cat = t.roundCats[t.round];
      if (S.settings.doubleLast && t.rounds > 1 && t.round === t.rounds - 1) mult = 2;
    } else {
      ctx = 'match';
      var m = curMatch(S), pair = Math.floor(m.turn / 2);
      var firstTeam = pair % 2 === 0 ? m.a : m.b, second = pair % 2 === 0 ? m.b : m.a;
      if (m.turn % 2 === 0) m.cat = nextCat(S);
      teamId = m.turn % 2 === 0 ? firstTeam : second;
      cat = m.cat;
    }
    var tm = team(S, teamId);
    var pid = tm.members[tm.rot % tm.members.length];
    tm.rot++;
    S.turnCount++;
    S.turn = {
      n: S.turnCount, ctx: ctx, teamId: teamId, playerId: pid, cat: cat, mult: mult, phase: 'pick',
      rec: recommend(player(S, pid)), diff: null, points: 0, q: null, wrongPicked: [], stealTeamId: null,
      outcome: null, secret: false, swaps: 0
    };
    S.screen = 'turn'; S.timer = null;
  }

  function questionSeconds(S) {
    var T = S.turn, q = T.q, base = S.settings.time;
    var p = player(S, T.playerId), bonus = p && p.age === 'child' ? 10 : 0;
    if (q.type === 'charades') return q.seconds || base * 2;
    if (q.type === 'physical') return q.seconds || base;
    return base + bonus;
  }
  function pick(S, diff, now) {
    var T = S.turn;
    if (!T || T.phase !== 'pick' || DIFFS.indexOf(diff) < 0) return false;
    var q = draw(S, T.cat, diff);
    if (!q) return false;
    setQuestion(S, q, now);
  }
  function setQuestion(S, q, now) {
    var T = S.turn;
    T.q = prepare(q, S); T.diff = q.diff; T.points = POINTS[q.diff] * T.mult;
    T.wrongPicked = []; T.secret = false;
    if (q.type === 'charades' || q.type === 'physical' || q.type === 'memory') { T.phase = 'prep'; S.timer = null; }
    else { T.phase = 'question'; startTimer(S, questionSeconds(S), now, 2600); }
  }
  function go(S, now) {
    var T = S.turn;
    if (!T || T.phase !== 'prep') return false;
    T.secret = false;
    if (T.q.type === 'memory') { T.phase = 'memorize'; startTimer(S, T.q.memo.seconds, now, 600); }
    else { T.phase = 'question'; startTimer(S, questionSeconds(S), now, 0); }
  }
  function toQuestion(S, now) {
    var T = S.turn;
    if (!T || T.phase !== 'memorize') return false;
    T.phase = 'question'; startTimer(S, questionSeconds(S), now, 1200);
  }
  function swap(S, now) {
    var T = S.turn;
    if (!T || !T.q || ['prep', 'memorize', 'question'].indexOf(T.phase) < 0 || T.wrongPicked.length) return false;
    var q = draw(S, T.cat, T.diff);
    if (!q) return false;
    T.swaps++;
    setQuestion(S, q, now);
  }
  function stealTeam(S) {
    var T = S.turn, t = S.t;
    if (T.ctx === 'match') { var m = curMatch(S); return m.a === T.teamId ? m.b : m.a; }
    var n = t.order.length;
    return t.order[(t.round + t.turnIdx + 1) % n];
  }
  function award(S, teamId, pts, pid, diff, isSteal) {
    var T = S.turn, tm = team(S, teamId);
    tm.total += pts; tm.correct++;
    if (diff === 'hard') tm.hard++;
    if (isSteal) tm.steals++;
    if (T.ctx === 'group') tm.score += pts;
    else { var m = curMatch(S); if (m.a === teamId) m.sa += pts; else m.sb += pts; }
    var p = pid && player(S, pid);
    if (p) { p.correct++; p.points += pts; }
  }
  function resolve(S) {
    var T = S.turn, isSteal = T.phase === 'steal';
    var teamId = isSteal ? T.stealTeamId : T.teamId;
    var pts = isSteal ? T.points / 2 : T.points;
    award(S, teamId, pts, isSteal ? null : T.playerId, T.diff, isSteal);
    T.outcome = { ok: true, by: isSteal ? 'steal' : 'team', teamId: teamId, points: pts };
    T.phase = 'result'; S.timer = null;
  }
  function miss(S, now, timeout) {
    var T = S.turn;
    if (T.phase === 'question') {
      var tm = team(S, T.teamId), p = player(S, T.playerId);
      tm.wrong++; if (p) p.wrong++;
      var q = T.q, canSteal = S.settings.steal && S.teams.length > 1 &&
        (q.type === 'open' || (MCQ_TYPES[q.type] && q.options.length >= 3));
      if (canSteal) {
        T.phase = 'steal'; T.stealTeamId = stealTeam(S); T.timeout = !!timeout;
        startTimer(S, 15, now, 1500);
        return;
      }
    }
    T.outcome = { ok: false, by: null, teamId: null, points: 0, timeout: !!timeout, stealTried: T.phase === 'steal' };
    T.phase = 'result'; S.timer = null;
  }
  function answer(S, i, now) {
    var T = S.turn;
    if (!T || (T.phase !== 'question' && T.phase !== 'steal') || !T.q.options) return false;
    if (!(i >= 0 && i < T.q.options.length) || T.wrongPicked.indexOf(i) >= 0) return false;
    if (i === T.q.answer) resolve(S);
    else { T.wrongPicked.push(i); miss(S, now, false); }
  }
  function judge(S, ok, now, timeout) {
    var T = S.turn;
    if (!T || (T.phase !== 'question' && T.phase !== 'steal')) return false;
    if (ok) resolve(S); else miss(S, now, timeout);
  }
  function advance(S) {
    var t = S.t, T = S.turn;
    if (T.ctx === 'group') {
      t.turnIdx++;
      if (t.turnIdx < t.order.length) startTurn(S);
      else { S.turn = null; S.screen = 'scoreboard'; }
    } else {
      var m = curMatch(S);
      m.turn++;
      if (m.turn < S.settings.matchQ * 2) startTurn(S);
      else if (m.sa !== m.sb) finishMatch(S, m.sa > m.sb ? m.a : m.b);
      else beginTiebreak(S, [m.a, m.b], 1, 'match');
    }
  }

  /* ── نهاية المجموعات وكسر التعادل ── */
  function qualifyCount(S) {
    var n = S.teams.length;
    if (S.settings.format === 'league') return 1;
    return n >= 4 ? 4 : 2;
  }
  function endGroup(S) {
    var st = standings(S), cut = qualifyCount(S);
    if (cut < st.length && equalRank(st[cut - 1], st[cut])) {
      var tied = st.filter(function (x) { return equalRank(x, st[cut - 1]); });
      var firstIdx = st.indexOf(tied[0]);
      beginTiebreak(S, tied.map(function (x) { return x.id; }), cut - firstIdx, 'group');
      return;
    }
    S.t.groupDone = true;
    if (S.settings.format === 'league') finishTournament(S);
    else { buildBracket(S, st.slice(0, cut).map(function (x) { return x.id; })); S.screen = 'bracket'; }
  }
  function beginTiebreak(S, teamIds, slots, reason) {
    S.turn = null; S.timer = null;
    S.tb = { teamIds: teamIds.slice(), all: teamIds.slice(), slots: slots, winners: [], reason: reason, phase: 'intro', q: null, last: null, n: 0 };
    S.screen = 'tiebreak';
  }
  function tbQuestion(S, now) {
    var cats = S.settings.cats.filter(function (c) { return BANK.some(function (q) { return q.cat === c && q.type === 'mcq'; }); });
    var cat = cats.length ? cats[Math.floor(rand(S) * cats.length)] : null;
    var q = draw(S, cat, 'medium', function (x) { return x.type === 'mcq'; });
    var tb = S.tb;
    tb.n++; tb.last = null;
    if (!q) { tb.q = null; tb.phase = 'question'; return; } // لا أسئلة: القرعة فقط
    tb.q = prepare(q, S); tb.phase = 'question';
    startTimer(S, 30, now, 2600);
  }
  function tbWin(S, teamId, coin) {
    var tb = S.tb;
    if (!tb || tb.phase !== 'question') return false;
    if (coin) teamId = tb.teamIds[Math.floor(rand(S) * tb.teamIds.length)];
    if (teamId != null) {
      if (tb.teamIds.indexOf(teamId) < 0) return false;
      tb.winners.push(teamId);
      tb.teamIds.splice(tb.teamIds.indexOf(teamId), 1);
    }
    tb.last = { teamId: teamId == null ? null : teamId, coin: !!coin };
    tb.phase = 'reveal'; S.timer = null;
  }
  function tbNext(S, now) {
    var tb = S.tb;
    if (tb.phase === 'intro') return tbQuestion(S, now);
    if (tb.phase !== 'reveal') return false;
    if (tb.winners.length < tb.slots) return tbQuestion(S, now);
    S.tb = null;
    if (tb.reason === 'match') { var m = curMatch(S); m.tb = true; finishMatch(S, tb.winners[0]); }
    else {
      tb.winners.forEach(function (id, i) { team(S, id).tb = tb.slots - i; });
      endGroup(S);
    }
  }

  function finishMatch(S, winnerId) {
    var m = curMatch(S), c = S.t.cur;
    m.winner = winnerId; m.done = true;
    if (!c.third) propagate(S, c.r, c.i);
    S.turn = null; S.timer = null;
    S.screen = 'matchResult';
  }

  function finishTournament(S) {
    var ranking, br = S.t.bracket;
    if (br && br.champion) {
      var f = br.rounds[br.rounds.length - 1][0];
      var top = [f.winner, f.winner === f.a ? f.b : f.a];
      if (br.third && br.third.done) top.push(br.third.winner, br.third.winner === br.third.a ? br.third.b : br.third.a);
      var rest = S.teams.filter(function (t) { return top.indexOf(t.id) < 0; })
        .sort(function (a, b) { return eliminatedRound(br, b.id) - eliminatedRound(br, a.id) || cmpTeams(a, b) || (b.total - a.total); })
        .map(function (t) { return t.id; });
      ranking = top.concat(rest);
    } else ranking = standings(S).map(function (t) { return t.id; });
    var mvp = S.players.slice().sort(function (a, b) { return (b.points - a.points) || (b.correct - a.correct) || (a.wrong - b.wrong); })[0];
    var kids = S.players.filter(function (p) { return p.age === 'child' && p.correct > 0; })
      .sort(function (a, b) { return (b.correct - a.correct) || (b.points - a.points); });
    var thief = S.teams.slice().sort(function (a, b) { return b.steals - a.steals; })[0];
    S.result = {
      ranking: ranking,
      mvp: mvp && mvp.points > 0 ? mvp.id : null,
      kid: kids.length ? kids[0].id : null,
      thief: thief && thief.steals > 0 ? thief.id : null
    };
    S.turn = null; S.timer = null; S.t.stage = 'done';
    S.screen = 'winner';
  }
  function eliminatedRound(br, id) {
    var r = -1;
    br.rounds.forEach(function (list, i) { list.forEach(function (m) { if (m.a === id || m.b === id) r = i; }); });
    return r;
  }

  function adjust(S, teamId, delta) {
    var tm = team(S, teamId); if (!tm || !S.t) return false;
    var m = S.t.stage === 'bracket' && S.t.cur ? curMatch(S) : null;
    if (m && !m.done && (m.a === teamId || m.b === teamId)) {
      if (m.a === teamId) m.sa = Math.max(0, m.sa + delta); else m.sb = Math.max(0, m.sb + delta);
    } else tm.score = Math.max(0, tm.score + delta);
    tm.total = Math.max(0, tm.total + delta);
  }

  function next(S, now) {
    var sc = S.screen, T = S.turn, t = S.t;
    if (sc === 'intro') { S.intro.idx++; if (S.intro.idx >= S.intro.count) beginStage(S); return; }
    if (sc === 'roundIntro') return startTurn(S);
    if (sc === 'turn') {
      if (T.phase === 'pick') return pick(S, T.rec, now);
      if (T.phase === 'prep') return go(S, now);
      if (T.phase === 'memorize') return toQuestion(S, now);
      if (T.phase === 'result') return advance(S);
      return false;
    }
    if (sc === 'scoreboard') {
      t.round++;
      if (t.round < t.rounds) startRound(S); else endGroup(S);
      return;
    }
    if (sc === 'bracket') {
      var nm = nextMatch(S);
      if (!nm) return finishTournament(S);
      t.cur = nm; S.screen = 'matchIntro'; return;
    }
    if (sc === 'matchIntro') return startTurn(S);
    if (sc === 'matchResult') {
      if (!nextMatch(S)) return finishTournament(S);
      S.screen = 'bracket'; return;
    }
    if (sc === 'tiebreak') return tbNext(S, now);
    return false;
  }

  /* نقطة الدخول الوحيدة لكل الأحداث. تعيد false إذا كان الحدث غير صالح في الحالة الحالية */
  function act(S, a, now) {
    now = now || Date.now();
    switch (a.type) {
      case 'START': return start(S);
      case 'NEXT': return next(S, now);
      case 'PICK': return pick(S, a.diff, now);
      case 'GO': return go(S, now);
      case 'SECRET': if (!S.turn || S.turn.phase !== 'prep') return false; S.turn.secret = !S.turn.secret; return;
      case 'ANSWER': return answer(S, a.i, now);
      case 'JUDGE': return judge(S, !!a.ok, now, false);
      case 'TIMEUP':
        if (!S.timer) return false;
        if (S.screen === 'tiebreak') { S.timer = null; return; }
        if (S.turn && S.turn.phase === 'memorize') return toQuestion(S, now);
        return judge(S, false, now, true);
      case 'SWAP': return swap(S, now);
      case 'TIMER': return timerOp(S, a.op, now);
      case 'ADJUST': return adjust(S, a.teamId, a.delta);
      case 'TB_WIN': return tbWin(S, a.teamId, false);
      case 'TB_NONE': return tbWin(S, null, false);
      case 'TB_COIN': return tbWin(S, null, true);
      default: return false;
    }
  }

  return {
    POINTS: POINTS, DIFFS: DIFFS, setBank: setBank, getBank: getBank, newState: newState, defaultSettings: defaultSettings,
    balanceTeams: balanceTeams, weight: weight, validateQuestion: validateQuestion, validateBank: validateBank, norm: norm,
    act: act, standings: standings, team: team, player: player, curMatch: curMatch, roundName: roundName, nextMatch: nextMatch,
    qualifyCount: qualifyCount, seedOrder: seedOrder, freezeTimer: freezeTimer, recommend: recommend, rand: rand, shuffle: shuffle
  };
});
