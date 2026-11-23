// POST /api/ask  (Alexi's app, signed in). Body {questionId, reply?}. Emails the partner a one-question link.
const L = require('./_lib');
const json = (s, o) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  let uid, email;
  try { const tok = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer /, ''); const d = await L.admin.auth().verifyIdToken(tok); uid = d.uid; email = d.email; } catch (e) { return json(401, { error: 'Sign in again' }); }
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const ctx = await L.load(uid, String(body.questionId || '')); if (!ctx || !ctx.t) return json(404, { error: 'Question not found' });
  const { q, t, people, acct, base } = ctx;
  const live = process.env.ASK_LIVE === '1', to = live ? people.partnerEmail : email;
  if (!to) return json(400, { error: 'Add ' + people.partner + "'s email in Settings first" });
  const mine = (q.messages || []).filter(m => m.from === 'me'), last = mine[mine.length - 1];
  const token = L.newToken(), link = p => `${L.SITE}/ask/${uid}~${q.id}?t=${token}&a=${p}`;
  const inbound = process.env.INBOUND_DOMAIN, replyTo = inbound ? `reply+${uid}~${q.id}.${token}@${inbound}` : '';
  const mail = L.emailToPartner({ people, t, acct, text: last ? last.text : '', link, reply: !!body.reply, reminder: !!body.reminder, canReply: !!inbound });
  try { await L.sendMail({ to, subject: (live ? '' : '[TEST to you only] ') + mail.subject, html: mail.html, text: mail.text, replyTo }); }
  catch (e) { return json(e.code === 'not_configured' ? 501 : 502, { error: e.message }); }
  await base.collection('questions').doc(q.id).update({ tokenHash: L.sha(token), expiresAt: new Date(Date.now() + L.DAYS14).toISOString(), emailed: true, ...(body.reminder ? { remindedAt: new Date().toISOString() } : {}), emailedTo: live ? 'partner' : 'owner-test', ownerEmail: email, sendNote: L.admin.firestore.FieldValue.delete() });
  return json(200, { ok: true, live });
};
