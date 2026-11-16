/* اختبار شامل عبر المتصفح: يلعب بطولات كاملة من الإعداد حتى التتويج بالنقر على الواجهة فقط */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.SHOTS || '';
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

async function playTournament(page, cfg, tag) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await shot(page, tag + '-01-home');
  await page.click('[data-do="new"]');
  // لاعب يدوي + تعبئة تجريبية
  await page.fill('#pname', 'ليان');
  await page.click('.avatars button:nth-child(16)');
  await page.click('[data-k="form.age"][data-v="child"]');
  await page.click('.pform button[type=submit]');
  await page.click('[data-do="sample"]');
  assert.strictEqual(await page.locator('.pcard').count(), 9);
  await shot(page, tag + '-02-players');
  await page.click('.nav .btn.primary');
  for (const [k, v] of Object.entries(cfg)) await page.click(`[data-k="settings.${k}"][data-v="${v}"]`);
  await shot(page, tag + '-03-settings');
  await page.click('.nav .btn.primary');
  await shot(page, tag + '-04-teams');
  await page.click('[data-do="start"]');

  const seen = new Set(); let steps = 0, awarded = 0; const shots = new Set();
  for (;;) {
    assert.ok(++steps < 1500, 'tournament should finish');
    const st = await page.evaluate(() => { const S = FG.S, T = S.turn; return { screen: S.screen, phase: T ? T.phase : (S.tb ? 'tb-' + S.tb.phase : ''), q: T && T.q ? { id: T.q.id, type: T.q.type, answer: T.q.answer, n: T.q.options ? T.q.options.length : 0 } : null, wrong: T ? T.wrongPicked : [], n: T ? T.n : 0, swaps: T ? T.swaps : 0, total: S.teams.reduce((s, t) => s + t.total, 0), out: T && T.outcome }; });
    const key = st.screen + '-' + st.phase + (st.q && ['question', 'prep', 'memorize'].includes(st.phase) ? '-' + st.q.type : '');
    if (!shots.has(key)) { shots.add(key); await page.waitForTimeout(SHOTS ? 3300 : 0); await shot(page, tag + '-s-' + key); }
    if (st.screen === 'winner') break;
    if (st.screen === 'turn' && st.q && st.phase === 'question') { const k = st.q.id; if (!seen.has(k + ':' + st.n)) { assert.ok(!seen.has(k), 'repeated question ' + k); seen.add(k); seen.add(k + ':' + st.n); } }
    if (st.screen === 'turn' && st.phase === 'pick') {
      const picks = page.locator('#screen .pick');
      await picks.nth(steps % await picks.count()).click();
    } else if (st.screen === 'turn' && (st.phase === 'question' || st.phase === 'steal')) {
      const good = (steps * 7) % 10 < 6;
      if (st.q.n) {
        let i = st.q.answer;
        if (!good) i = [0, 1, 2, 3].filter(x => x < st.q.n && x !== st.q.answer && !st.wrong.includes(x))[0];
        if (steps % 2) await page.click(`#screen .opt:nth-child(${i + 1})`); else await page.keyboard.press(String(i + 1));
      } else await page.click(good ? '#dock .btn.good' : '#dock .btn.bad');
      const after = await page.evaluate(() => ({ total: FG.S.teams.reduce((s, t) => s + t.total, 0), out: FG.S.turn && FG.S.turn.outcome, phase: FG.S.turn && FG.S.turn.phase }));
      if (after.phase === 'result') { assert.strictEqual(after.total - st.total, after.out.points); awarded += after.out.points; }
      else assert.strictEqual(after.total, st.total);
    } else if (st.screen === 'tiebreak' && st.phase === 'tb-question') {
      await page.click('#dock .btn.teamb');
    } else if (steps % 3 === 0) await page.keyboard.press('Space');
    else await page.click('#dock .btn.primary');
  }
  const end = await page.evaluate(() => ({ total: FG.S.teams.reduce((s, t) => s + t.total, 0), ranking: FG.S.result.ranking, teams: FG.S.teams.length, name: document.querySelector('.winner .team-title').textContent }));
  assert.strictEqual(end.total, awarded, 'scores match awarded points');
  assert.strictEqual(end.ranking.length, end.teams);
  await page.waitForTimeout(SHOTS ? 3500 : 0);
  await shot(page, tag + '-99-winner');
  console.log(`✓ ${tag}: ${steps} خطوة، ${seen.size / 2} سؤالًا، البطل: ${end.name.trim()}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|net::/i.test(m.text())) errors.push(m.text()); });
  await playTournament(page, { teamCount: 4, format: 'full', rounds: 3 }, 'full4');
  if (!SHOTS) {
    await playTournament(page, { teamCount: 2, format: 'full', rounds: 4, diffMode: 'auto' }, 'full2');
    await playTournament(page, { teamCount: 3, format: 'league', rounds: 5 }, 'league3');
    await playTournament(page, { mode: 'solo', format: 'knockout', matchQ: 2 }, 'solo-ko');
    await playTournament(page, { mode: 'solo', format: 'full', rounds: 3 }, 'solo-full');
    // الاستمرار بعد إعادة تحميل الصفحة + التراجع
    await page.reload();
    assert.ok(await page.locator('[data-do="resume"]').count(), 'resume offered after reload');
    await page.click('[data-do="resume"]');
    assert.ok(await page.locator('.winner').count());
  }
  assert.deepStrictEqual(errors, [], 'no console errors');
  await browser.close();
  console.log('E2E OK');
})().catch(e => { console.error(e); process.exit(1); });
