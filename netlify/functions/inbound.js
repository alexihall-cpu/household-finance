// POST /api/inbound  Resend "email.received" webhook. A reply to the question email becomes a note on the question.
// Needs: RESEND_WEBHOOK_SECRET, RESEND_API_KEY, INBOUND_DOMAIN (e.g. mail.alexihall.com, with Resend receiving switched on).
const L = require('./_lib');
const ok = (s, m) => ({ statusCode: s, body: m || '' });
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return ok(405);
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (!L.verifyWebhook(headers, raw)) return ok(401, 'bad signature');
  let ev; try { ev = JSON.parse(raw); } catch (e) { return ok(400); }
  if (ev.type !== 'email.received' || !ev.data) return ok(200, 'ignored');
  const addrs = [].concat(ev.data.to || []).join(' '), m = /reply\+([A-Za-z0-9]+)~([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)@/.exec(addrs);
  if (!m) return ok(200, 'not a question reply');
  const ctx = await L.load(m[1], m[2]);
  if (!ctx || !ctx.t || !L.sameHash(m[3], ctx.q.tokenHash) || !ctx.q.expiresAt || new Date(ctx.q.expiresAt) < new Date()) return ok(200, 'link expired');
  const r = await fetch('https://api.resend.com/emails/receiving/' + encodeURIComponent(ev.data.email_id), { headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY } });
  if (!r.ok) return ok(502, 'could not read the email');
  const mail = await r.json(), words = L.newWords(mail.text || (mail.html || '').replace(/<[^>]+>/g, ' '));
  if (!words) return ok(200, 'empty');
  const { q, t, people, acct, base } = ctx;
  await base.collection('questions').doc(q.id).update({ messages: L.admin.firestore.FieldValue.arrayUnion({ from: 'partner', text: words, at: new Date().toISOString(), via: 'email' }), suggestionDismissed: false });
  if (q.ownerEmail) { try { const out = L.emailToOwner({ people, t, acct, pick: '', note: words, appUrl: `${L.SITE}/transactions/${(t.date || '').slice(0, 7)}?filter=questions`, asked: ((q.messages || []).filter(x => x.from === 'me').pop() || {}).text }); await L.sendMail({ to: q.ownerEmail, subject: `${people.partner} replied: ${L.title(t.description)}`, html: out.html, text: out.text }); } catch (e) { /* the app still shows it */ } }
  return ok(200, 'saved');
};
