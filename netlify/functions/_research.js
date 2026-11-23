// The research engine. Public deal facts only go to Claude; the result is written to the app's own Firestore.
// Env: ANTHROPIC_API_KEY (the owner's own key), FEED_UID, RESEARCH_MAX_USD (cost cap per run, default 1.50),
//      RESEARCH_MAX_SEARCHES (default 30), RESEARCH_MODEL (default claude-sonnet-5-5), RESEARCH_FALLBACKS=off to disable.
const B = require('./_brief');
const MODEL = () => process.env.RESEARCH_MODEL || 'claude-sonnet-5-5';
const CAP = () => Number(process.env.RESEARCH_MAX_USD || 1.5);
const MAX_SEARCHES = () => Number(process.env.RESEARCH_MAX_SEARCHES || 30);
const MAX_FETCHES = () => Number(process.env.RESEARCH_MAX_FETCHES || 40);
const PRICE = { in: 2e-6, out: 10e-6, cacheRead: 0.2e-6, cacheWrite: 2.5e-6, search: 0.01 };   // Sonnet 5.5 list price, USD (estimate)

function costOf(u, searches) { u = u || {}; return (u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out + (u.cache_read_input_tokens || 0) * PRICE.cacheRead + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + searches * PRICE.search; }

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHttps = v => { try { return new URL(v).protocol === 'https:'; } catch (e) { return false; } };
const date = v => (isDate(v) ? v : null), list = (v, n, m) => (Array.isArray(v) ? v.map(x => str(x, n)).filter(Boolean).slice(0, m) : []);
const UNITS = ['once', 'year', 'month', 'percent'];
function cleanDeal(d) {
  if (!d || typeof d !== 'object') return null;
  const r = d.rules || {}, x = d.excludes || {}, v = d.value || {}, m = d.match || {};
  const out = { id: str(d.id, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''), kind: B.KINDS.includes(d.kind) ? d.kind : '', provider: str(d.provider, 60), group: str(d.group, 60) || null,
    title: str(d.title, 100), summary: str(d.summary, 400), value: { amount: num(v.amount), unit: UNITS.includes(v.unit) ? v.unit : null, text: str(v.text, 80) }, conditions: list(d.conditions, 160, 8),
    rules: { fullSwitch: typeof r.fullSwitch === 'boolean' ? r.fullSwitch : null, minDirectDebits: num(r.minDirectDebits), minPayIn: num(r.minPayIn), payInWithinDays: num(r.payInWithinDays), closeOld: typeof r.closeOld === 'boolean' ? r.closeOld : null,
      jointAllowed: typeof r.jointAllowed === 'boolean' ? r.jointAllowed : null, creditCheck: ['hard', 'soft', 'none'].includes(r.creditCheck) ? r.creditCheck : null, monthlyFee: num(r.monthlyFee), paidWithinDays: num(r.paidWithinDays), minHoldDays: num(r.minHoldDays) },
    excludes: { text: list(x.text, 240, 6), groups: list(x.groups, 60, 12), bonusSince: date(x.bonusSince), heldSince: date(x.heldSince) },
    url: str(d.url, 400), termsUrl: isHttps(d.termsUrl) ? str(d.termsUrl, 400) : null, source: str(d.source, 400), validFrom: date(d.validFrom), validTo: date(d.validTo), checkedAt: date(d.checkedAt),
    match: { needs: list(m.needs, 30, 6), minMonthlyIn: num(m.minMonthlyIn), minMonthlySpend: num(m.minMonthlySpend) } };
  if (!out.id || !out.kind || !out.provider || !out.title || !out.value.text || !isHttps(out.url) || !out.checkedAt) return null;
  return out;
}
function cleanFact(f) {
  if (!f || typeof f !== 'object') return null; const v = f.value || {};
  const out = { id: str(f.id, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''), kind: str(f.kind, 30), title: str(f.title, 120), value: { amount: num(v.amount), unit: str(v.unit, 20) || null, text: str(v.text, 100) }, date: date(f.date), url: str(f.url, 400), checkedAt: date(f.checkedAt) };
  return out.id && out.title && isHttps(out.url) && out.checkedAt ? out : null;
}
function parseFeed(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('The reply had no JSON');
  const raw = JSON.parse(text.slice(a, b + 1)), seen = new Set(), deals = [], dl = Array.isArray(raw.deals) ? raw.deals : [], fl = Array.isArray(raw.facts) ? raw.facts : [];
  for (const d of dl) { const c = cleanDeal(d); if (c && !seen.has(c.id)) { seen.add(c.id); deals.push(c); } }
  const facts = fl.map(cleanFact).filter(Boolean).slice(0, 40);
  const changes = (Array.isArray(raw.changes) ? raw.changes : []).map(c => ({ id: str(c && c.id, 80), what: ['new', 'changed', 'dropped', 'ending-soon'].includes(c && c.what) ? c.what : 'changed', note: str(c && c.note, 200) })).slice(0, 80);
  return { deals: deals.slice(0, 80), facts, changes, dropped: dl.length - deals.length };
}
const parseDeals = parseFeed;

function request(today, yesterday) {
  const body = { model: MODEL(), max_tokens: 24000, system: B.SYSTEM(today), output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES(), user_location: { type: 'approximate', country: 'GB' } }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_FETCHES() }] };
  if (process.env.RESEARCH_FALLBACKS !== 'off') { body.betas = ['server-side-fallback-2026-07-01']; body.fallbacks = 'default'; }
  return { body, user: B.USER(today, yesterday) };
}

// one run. deps: { client, db, uid, now } so it can be tested without the network.
async function run({ client, db, uid, dry, now }) {
  const today = (now || new Date()).toISOString().slice(0, 10), base = db.collection('users').doc(uid).collection('settings'), status = base.doc('researchStatus');
  const startedAt = (now || new Date()).toISOString(), prev = await base.doc('dealsFeed').get().catch(() => null), yesterday = prev && prev.exists ? { deals: (prev.data().deals || []), facts: (prev.data().facts || []) } : null, { body, user } = request(today, yesterday);
  const plan = { model: body.model, maxSearches: MAX_SEARCHES(), capUsd: CAP(), promptChars: B.SYSTEM.length + user.length, fallbacks: !!body.fallbacks };
  if (dry) { await status.set({ state: 'dry-run-ok', startedAt, finishedAt: new Date().toISOString(), dry: true, plan, error: null }, { merge: true }); return { dry: true, plan }; }
  await status.set({ state: 'running', startedAt, finishedAt: null, dry: false, plan, error: null }, { merge: true });
  let cost = 0, searches = 0, carry = [], resp;
  try {
    for (let i = 0; i < 8; i++) {
      const messages = [{ role: 'user', content: user }].concat(carry.length ? [{ role: 'assistant', content: carry }] : []);
      resp = await client.beta.messages.create(Object.assign({}, body, { messages }));
      searches += (resp.usage && resp.usage.server_tool_use && resp.usage.server_tool_use.web_search_requests) || 0; cost += costOf(resp.usage, 0);
      if (resp.stop_reason === 'refusal') throw new Error('The model declined this request');
      if (resp.stop_reason !== 'pause_turn') break;
      if (cost + searches * PRICE.search > CAP()) throw new Error('Stopped: the cost cap of $' + CAP().toFixed(2) + ' was reached');
      carry = carry.concat(resp.content);
    }
    if (resp.stop_reason === 'pause_turn') throw new Error('Stopped: too many continuations');
    const total = cost + searches * PRICE.search;
    const text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const { deals, facts, changes, dropped } = parseFeed(text);
    if (!deals.length) throw new Error('No valid deals came back, so yesterday\'s list was kept');
    const feed = { version: 1, updated: new Date().toISOString(), count: deals.length, deals, facts, changes, source: 'kodu-research', model: body.model };
    await base.doc('dealsFeed').set(feed);
    await base.doc('dealsFeed-' + today).set(feed).catch(() => {});   // dated copy so changes can be traced
    const fin = { state: 'ok', finishedAt: new Date().toISOString(), dealsFound: deals.length, dropped, searches, costUsd: Math.round(total * 100) / 100, error: null, lastOkAt: new Date().toISOString() };
    await status.set(fin, { merge: true }); return Object.assign({ ok: true }, fin);
  } catch (e) {
    const fin = { state: 'error', finishedAt: new Date().toISOString(), searches, costUsd: Math.round((cost + searches * PRICE.search) * 100) / 100, error: String(e && e.message || e).slice(0, 300) };
    await status.set(fin, { merge: true }).catch(() => {}); return Object.assign({ ok: false }, fin);
  }
}
module.exports = { run, request, parseFeed, parseDeals, cleanDeal, cleanFact, costOf };
