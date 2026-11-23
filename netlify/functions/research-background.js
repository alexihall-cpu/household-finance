// Background function (up to 15 minutes). Started by the nightly schedule (research.js) or by "Run now" in Settings.
// Auth: header x-research-key = RESEARCH_KEY (the schedule), or a Firebase ID token (the owner in the app).
// Body (optional): {"dry": true} checks the setup without calling Claude.
const L = require('./_lib');
const R = require('./_research');
exports.handler = async (event) => {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  let uid = process.env.FEED_UID || '', ok = false;
  if (process.env.RESEARCH_KEY && h['x-research-key'] === process.env.RESEARCH_KEY) ok = true;
  else if ((h.authorization || '').startsWith('Bearer ')) { try { const d = await L.admin.auth().verifyIdToken(h.authorization.slice(7)); uid = uid || d.uid; ok = d.uid === uid; } catch (e) { /* not signed in */ } }
  if (!ok || !uid) return { statusCode: 401, body: 'no' };
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) { /* none */ }
  const Anthropic = require('@anthropic-ai/sdk'); const client = new (Anthropic.default || Anthropic)({ maxRetries: 2, timeout: 10 * 60 * 1000 });
  if (!process.env.ANTHROPIC_API_KEY && !body.dry) { await L.db.collection('users').doc(uid).collection('settings').doc('researchStatus').set({ state: 'error', finishedAt: new Date().toISOString(), error: 'No ANTHROPIC_API_KEY is set in the hosting settings.' }, { merge: true }); return { statusCode: 200, body: 'no key' }; }
  const r = await R.run({ client, db: L.db, uid, dry: !!body.dry });
  return { statusCode: 200, body: JSON.stringify(r) };
};
