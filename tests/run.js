// SALOGBOOK automated checks. Run: cd tests && npm install && npx playwright install chromium && node run.js
// Loads index.html in headless Chrome with the Supabase/OCR libraries stubbed, then checks the pure
// calculation functions (aircraft type families, RVR conversion, FDP/duty limits when present).
const path = require('path');
const { chromium } = require('playwright');

const checks = [];
const eq = (name, got, want) => checks.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route(/supabase\.co/, r => r.abort());
  await page.addInitScript(() => {
    window.supabase = { createClient: () => ({
      auth: { onAuthStateChange() {}, signOut: async () => {}, getSession: async () => ({ data: { session: null } }) },
      functions: { invoke: async () => ({ data: null, error: { message: 'offline test' } }) },
    }) };
    window.Tesseract = {}; window.pdfjsLib = { GlobalWorkerOptions: {} };
  });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const o = {};
    o.fam = ['A330', 'A333', 'A343', 'A342', 'A346', 'A320', 'A319', 'A21N', 'B738'].map(t => curTypeFamily(t));
    o.hasDuty = typeof fdpMax === 'function';
    if (o.hasDuty) {
      const m = a => fdpMax(a).h;
      o.fdp = [
        m({ startMin: 315, sectors: 1, acc: true }), m({ startMin: 420, sectors: 1, acc: true }),
        m({ startMin: 420, sectors: 4, acc: true }), m({ startMin: 1320, sectors: 3, acc: true }),
        m({ startMin: 60, sectors: 8, acc: true }), m({ startMin: 420, sectors: 3, acc: false, restH: 20 }),
        m({ startMin: 420, sectors: 3, acc: false, restH: 10 }),
      ];
      o.ext = [fdpExtend(14, 'bunk', 6).h, fdpExtend(14, 'seat', 6).h, fdpExtend(10, 'split', 4).h];
    }
    return o;
  });

  eq('type families A330/A340 grouped', r.fam[0] === r.fam[1] && r.fam[2] === r.fam[3] && r.fam[2] === r.fam[4] , true);
  eq('A320 family differs from A330', r.fam[5] !== r.fam[0], true);
  eq('A320/A319/A21N grouped', r.fam[5] === r.fam[6] && r.fam[5] === r.fam[7], true);
  eq('B738 is its own family', r.fam[8] !== r.fam[5], true);
  if (r.hasDuty) {
    eq('FDP table values', r.fdp, [13, 14, 11.75, 9.5, 9, 10.5, 11.5]);
    eq('FDP extensions', r.ext, [17, 15, 12]);
  } else console.log('(duty module not present on this branch: FDP checks skipped)');
  eq('no page errors on load', errors, []);

  let bad = 0;
  for (const c of checks) {
    console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok ? '' : '  got ' + JSON.stringify(c.got) + ' want ' + JSON.stringify(c.want)));
    if (!c.ok) bad++;
  }
  await browser.close();
  console.log(bad ? bad + ' FAILED' : 'ALL ' + checks.length + ' PASSED');
  process.exit(bad ? 1 : 0);
})();
