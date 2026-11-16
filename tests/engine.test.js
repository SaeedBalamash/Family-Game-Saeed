'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const D = require('../js/questions.js');

E.setBank(D.QUESTIONS, D.CATEGORIES);
const ALL_CATS = D.CATEGORIES.map(c => c.id);

function mkPlayers(n, seed) {
  const S = { seed: seed >>> 0 };
  const ages = ['adult', 'adult', 'child', 'teen', 'adult', 'child', 'teen', 'adult', 'child', 'adult'];
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, name: 'لاعب ' + i, avatar: '🙂', age: ages[(i + Math.floor(E.rand(S) * 10)) % 10], skill: 1 + Math.floor(E.rand(S) * 3)
  }));
}
function setup(opts) {
  const S = E.newState(opts.seed);
  S.players = mkPlayers(opts.players, opts.seed + 7);
  Object.assign(S.settings, { cats: ALL_CATS.slice() }, opts.settings);
  if (S.settings.mode === 'solo') {
    S.teams = S.players.map((p, i) => ({ id: 't' + i, name: p.name, members: [p.id] }));
  } else {
    const groups = E.balanceTeams(S.players, S.settings.teamCount, S);
    S.teams = groups.map((m, i) => ({ id: 't' + i, name: 'فريق ' + i, members: m }));
  }
  return S;
}
// يلعب بطولة كاملة آليًا ويتحقق من الثوابت في كل خطوة
function playThrough(S, pCorrect) {
  let now = 1000, steps = 0, awarded = 0;
  const seenQ = new Set();
  let lastTurn = 0;
  assert.notStrictEqual(E.act(S, { type: 'START' }, now), false);
  const R = { seed: S.seed ^ 0x9e3779b9 };
  while (S.screen !== 'winner') {
    assert.ok(++steps < 5000, 'tournament must terminate');
    now += 500;
    const T = S.turn;
    if (S.screen === 'turn' && T.q && T.n !== lastTurn) {
      lastTurn = T.n;
    }
    if (S.screen === 'turn' && T.q) {
      if (!S.recycled) { if (!seenQ.has(T.q.id + ':' + T.n + ':' + T.swaps)) { assert.ok(!seenQ.has(T.q.id), 'no repeated question: ' + T.q.id); } }
      seenQ.add(T.q.id); seenQ.add(T.q.id + ':' + T.n + ':' + T.swaps);
    }
    if (S.screen === 'turn' && T.phase === 'pick') {
      const d = E.DIFFS[Math.floor(E.rand(R) * 3)];
      assert.notStrictEqual(E.act(S, { type: 'PICK', diff: d }, now), false);
      assert.strictEqual(S.turn.points, E.POINTS[S.turn.diff] * S.turn.mult);
    } else if (S.screen === 'turn' && (T.phase === 'question' || T.phase === 'steal')) {
      const r = E.rand(R);
      const before = S.teams.reduce((s, t) => s + t.total, 0);
      if (r < 0.1) E.act(S, { type: 'TIMEUP' }, now);
      else if (T.q.options && r < 0.8) {
        let i = T.q.answer;
        if (E.rand(R) > pCorrect) { const w = T.q.options.map((_, k) => k).filter(k => k !== T.q.answer && !T.wrongPicked.includes(k)); i = w[0]; }
        assert.notStrictEqual(E.act(S, { type: 'ANSWER', i }, now), false);
      } else E.act(S, { type: 'JUDGE', ok: E.rand(R) < pCorrect }, now);
      const after = S.teams.reduce((s, t) => s + t.total, 0);
      if (S.turn && S.turn.phase === 'result') {
        const o = S.turn.outcome;
        assert.strictEqual(after - before, o.points);
        if (o.ok && o.by === 'steal') assert.strictEqual(o.points, S.turn.points / 2);
        if (o.ok && o.by === 'team') assert.strictEqual(o.points, S.turn.points);
        awarded += o.points;
      }
    } else if (S.screen === 'tiebreak' && S.tb.phase === 'question') {
      const r = E.rand(R);
      if (r < 0.3) E.act(S, { type: 'TB_NONE' }, now);
      else if (r < 0.5) E.act(S, { type: 'TB_COIN' }, now);
      else E.act(S, { type: 'TB_WIN', teamId: S.tb.teamIds[0] }, now);
    } else {
      assert.notStrictEqual(E.act(S, { type: 'NEXT' }, now), false, 'NEXT must work on ' + S.screen + '/' + (T && T.phase));
    }
    if (S.timer) assert.ok(S.timer.dur > 0);
  }
  assert.strictEqual(S.teams.reduce((s, t) => s + t.total, 0), awarded, 'sum of totals equals awarded points');
  return S;
}

test('بنك الأسئلة: 150+ سؤالًا صالحًا وموزعًا على الفئات والمستويات', () => {
  assert.ok(D.QUESTIONS.length >= 150, 'count=' + D.QUESTIONS.length);
  assert.deepStrictEqual(E.validateBank(D.QUESTIONS, D.CATEGORIES), []);
  for (const c of D.CATEGORIES) for (const d of E.DIFFS) {
    const n = D.QUESTIONS.filter(q => q.cat === c.id && q.diff === d).length;
    assert.ok(n >= 4, `${c.id}/${d} has ${n}`);
  }
  for (const q of D.QUESTIONS) if (q.options) assert.strictEqual(q.answer, 0);
});

test('أسئلة الملاحظة والذاكرة: الإجابة مطابقة للّوحة فعلًا', () => {
  for (const q of D.QUESTIONS.filter(x => x.type === 'visual')) {
    const cells = q.visual.grid.flat(), s = q.spec, ans = q.options[q.answer];
    if (s.k === 'count') { assert.strictEqual(String(cells.filter(c => c === s.target).length), ans); assert.strictEqual(cells.length, s.rows * s.cols); }
    if (s.k === 'odd') { const row = q.visual.grid.findIndex(r => r.includes(s.odd)) + 1; assert.strictEqual('الصف ' + row, ans); assert.strictEqual(cells.filter(c => c === s.odd).length, 1); }
    if (s.k === 'most') { const cnt = {}; cells.forEach(c => cnt[c] = (cnt[c] || 0) + 1); const max = Math.max(...Object.values(cnt)); assert.strictEqual(Object.keys(cnt).filter(k => cnt[k] === max).length, 1); assert.strictEqual(cnt[ans], max); }
    if (s.k === 'missing') { assert.ok(!cells.includes(ans)); q.options.slice(1).forEach(o => assert.ok(cells.includes(o))); assert.strictEqual(cells.length, s.to - s.from); }
  }
  for (const q of D.QUESTIONS.filter(x => x.type === 'memory')) {
    const s = q.spec, ans = q.options[q.answer], shown = q.memo.items;
    if (s.k === 'absent') { assert.ok(!shown.includes(ans)); q.options.slice(1).forEach(o => assert.ok(shown.includes(o))); }
    if (s.k === 'pos') assert.strictEqual(shown[s.pos - 1], ans);
    if (s.k === 'num') assert.strictEqual(shown[0], ans);
    if (s.k === 'cnt') assert.strictEqual(String(shown.filter(x => x === s.target[0] + ' ' + s.target[1]).length), ans);
    assert.strictEqual(new Set(q.options).size, 4);
  }
});

test('التحقق من الأسئلة يرفض المدخلات الخاطئة', () => {
  const ok = { id: 'x', cat: 'general', diff: 'easy', type: 'mcq', q: 'ما عاصمة فرنسا؟', options: ['باريس', 'لندن', 'روما', 'مدريد'], answer: 0 };
  assert.deepStrictEqual(E.validateQuestion(ok), []);
  assert.ok(E.validateQuestion({ ...ok, options: ['باريس', 'باريس', 'روما', 'مدريد'] }).length);
  assert.ok(E.validateQuestion({ ...ok, answer: 7 }).length);
  assert.ok(E.validateQuestion({ ...ok, q: 'ما' }).length);
  assert.ok(E.validateQuestion({ ...ok, diff: 'x' }).length);
  assert.ok(E.validateQuestion({ ...ok, cat: 'nope' }).length);
  assert.ok(E.validateQuestion({ ...ok, type: 'open', answer: '' }).length);
  assert.deepStrictEqual(E.validateQuestion({ ...ok, type: 'open', answer: 'باريس' }), []);
  assert.ok(E.validateBank([ok, { ...ok, id: 'y', q: 'ما عاصمةُ فرنسا ؟' }]).length, 'duplicate detected despite diacritics');
});

test('توزيع الفرق: أحجام متقاربة وأطفال موزعون وقوة متوازنة', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const n = 6 + (seed % 5), k = 2 + (seed % 3);
    const players = mkPlayers(n, seed), S = { seed };
    const teams = E.balanceTeams(players, k, S);
    assert.strictEqual(teams.flat().length, n);
    assert.strictEqual(new Set(teams.flat()).size, n);
    const sizes = teams.map(t => t.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'sizes ' + sizes);
    const kids = teams.map(t => t.filter(id => players.find(p => p.id === id).age === 'child').length);
    assert.ok(Math.max(...kids) - Math.min(...kids) <= 1, 'kids ' + kids);
    const w = teams.map(t => t.reduce((s, id) => s + E.weight(players.find(p => p.id === id)), 0));
    assert.ok(Math.max(...w) - Math.min(...w) <= 9, 'weights ' + w);
  }
});

test('ترتيب البذور في شجرة الإقصائيات', () => {
  assert.deepStrictEqual(E.seedOrder(4), [1, 4, 2, 3]);
  assert.deepStrictEqual(E.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('بطولات كاملة آليًا: كل الصيغ وأعداد الفرق تنتهي ببطل ونقاط صحيحة', () => {
  let games = 0;
  for (const format of ['full', 'league', 'knockout']) {
    for (const cfg of [{ mode: 'teams', teamCount: 2 }, { mode: 'teams', teamCount: 3 }, { mode: 'teams', teamCount: 4 }, { mode: 'solo' }]) {
      for (let seed = 1; seed <= 25; seed++) {
        const players = cfg.mode === 'solo' ? 6 + (seed % 5) : 6 + (seed % 5);
        const S = setup({ seed: seed * 31 + games, players, settings: { ...cfg, format, rounds: 1 + (seed % 4), steal: seed % 3 !== 0, third: seed % 2 === 0, matchQ: 1 + (seed % 3) } });
        playThrough(S, [0, 0.5, 1, 0.8][seed % 4]);
        const r = S.result;
        assert.strictEqual(r.ranking.length, S.teams.length);
        assert.strictEqual(new Set(r.ranking).size, S.teams.length);
        if (format === 'league') {
          const st = E.standings(S);
          assert.strictEqual(r.ranking[0], st[0].id);
          if (st.length > 1) assert.ok(st[0].score > st[1].score || st[0].correct > st[1].correct || st[0].hard > st[1].hard || st[0].wrong < st[1].wrong || st[0].tb > st[1].tb, 'league winner is unambiguous');
        } else {
          const br = S.t.bracket, f = br.rounds[br.rounds.length - 1][0];
          assert.ok(f.done); assert.strictEqual(r.ranking[0], f.winner);
          br.rounds.flat().forEach(m => { assert.ok(m.done); if (!m.bye) assert.ok(m.tb || m.sa !== m.sb); if (!m.bye && !m.tb) assert.strictEqual(m.winner, m.sa > m.sb ? m.a : m.b); });
        }
        games++;
      }
    }
  }
  assert.ok(games >= 300);
});

test('تدوير الأدوار: كل فريق يلعب مرة في كل جولة وكل الأعضاء يشاركون', () => {
  const S = setup({ seed: 5, players: 9, settings: { mode: 'teams', teamCount: 3, format: 'league', rounds: 6 } });
  E.act(S, { type: 'START' }, 0);
  const perRound = {}, starters = [], who = {};
  let guard = 0;
  while (S.screen !== 'winner' && guard++ < 2000) {
    if (S.screen === 'turn' && S.turn.phase === 'pick') {
      const r = S.t.round; (perRound[r] = perRound[r] || []).push(S.turn.teamId);
      if (perRound[r].length === 1) starters.push(S.turn.teamId);
      (who[S.turn.teamId] = who[S.turn.teamId] || new Set()).add(S.turn.playerId);
      E.act(S, { type: 'PICK', diff: 'easy' }, 0);
    } else if (S.screen === 'turn' && (S.turn.phase === 'question' || S.turn.phase === 'steal')) E.act(S, { type: 'JUDGE', ok: S.turn.n % 3 === 0 }, 0);
    else if (S.screen === 'tiebreak' && S.tb.phase === 'question') E.act(S, { type: 'TB_WIN', teamId: S.tb.teamIds[0] }, 0);
    else E.act(S, { type: 'NEXT' }, 0);
  }
  for (const r in perRound) assert.strictEqual(new Set(perRound[r]).size, 3);
  assert.strictEqual(new Set(starters.slice(0, 3)).size, 3, 'starting team rotates');
  S.teams.forEach(t => assert.strictEqual(who[t.id].size, t.members.length));
});

test('النقاط حسب الصعوبة، السرقة بنصف النقاط، والجولة الأخيرة مضاعفة', () => {
  const S = setup({ seed: 9, players: 6, settings: { mode: 'teams', teamCount: 2, format: 'league', rounds: 2, cats: ['general'] } });
  E.act(S, { type: 'START' }, 0);
  while (S.screen !== 'turn') E.act(S, { type: 'NEXT' }, 0);
  const A = S.turn.teamId;
  E.act(S, { type: 'PICK', diff: 'hard' }, 0);
  assert.strictEqual(S.timer.running, true);
  E.act(S, { type: 'ANSWER', i: S.turn.q.answer }, 0);
  assert.strictEqual(E.team(S, A).score, 30);
  E.act(S, { type: 'NEXT' }, 0);
  const B = S.turn.teamId; assert.notStrictEqual(A, B);
  E.act(S, { type: 'PICK', diff: 'medium' }, 0);
  const wrong = (S.turn.q.answer + 1) % 4;
  E.act(S, { type: 'ANSWER', i: wrong }, 0);
  assert.strictEqual(S.turn.phase, 'steal'); assert.strictEqual(S.turn.stealTeamId, A);
  assert.strictEqual(E.act(S, { type: 'ANSWER', i: wrong }, 0), false, 'cannot re-pick the wrong option');
  E.act(S, { type: 'ANSWER', i: S.turn.q.answer }, 0);
  assert.strictEqual(E.team(S, A).score, 40); assert.strictEqual(E.team(S, B).score, 0); assert.strictEqual(E.team(S, A).steals, 1);
  E.act(S, { type: 'NEXT' }, 0); assert.strictEqual(S.screen, 'scoreboard');
  E.act(S, { type: 'NEXT' }, 0); E.act(S, { type: 'NEXT' }, 0);
  assert.strictEqual(S.turn.mult, 2);
  E.act(S, { type: 'PICK', diff: 'easy' }, 0);
  assert.strictEqual(S.turn.points, 20);
  E.act(S, { type: 'TIMER', op: 'pause' }, 1000); assert.strictEqual(S.timer.running, false);
  E.act(S, { type: 'TIMER', op: 'add' }, 1000); E.act(S, { type: 'TIMER', op: 'resume' }, 5000); assert.strictEqual(S.timer.running, true);
  const qid = S.turn.q.id; E.act(S, { type: 'SWAP' }, 5000); assert.notStrictEqual(S.turn.q.id, qid);
  E.act(S, { type: 'ADJUST', teamId: B, delta: 5 }, 0); assert.strictEqual(E.team(S, B).score, 5);
});

test('لا تكرار للأسئلة حتى في بطولة طويلة', () => {
  const S = setup({ seed: 77, players: 10, settings: { mode: 'solo', format: 'full', rounds: 8 } });
  playThrough(S, 0.6);
  assert.strictEqual(S.recycled, false);
  assert.strictEqual(new Set(S.used).size, S.used.length);
});
