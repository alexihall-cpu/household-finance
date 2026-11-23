// GET/POST /ask/<uid>~<questionId>?t=<token>&a=<pick>  The partner's reply page. No sign-in; the signed token is the key.
const L = require('./_lib');
const html = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: b });
const gone = () => html(410, L.pageShell(`<h1>This link has stopped working</h1><p class="m">It only lasts 14 days. Ask for a new one, or just tell them in person.</p>`));
exports.handler = async (event) => {
  const m = /\/ask\/([A-Za-z0-9]+)~([A-Za-z0-9]+)/.exec(event.path || ''); if (!m) return html(404, L.pageShell('<h1>Not found</h1>'));
  const post = event.httpMethod === 'POST', form = post ? Object.fromEntries(new URLSearchParams(event.body || '')) : (event.queryStringParameters || {});
  const token = String(form.t || ''), ctx = await L.load(m[1], m[2]);
  if (!ctx || !ctx.t || !L.sameHash(token, ctx.q.tokenHash) || !ctx.q.expiresAt || new Date(ctx.q.expiresAt) < new Date()) return gone();
  const { q, t, people, acct, base } = ctx, me = people.me;
  const card = L.pageShell; const lastMe = (q.messages || []).filter(x => x.from === 'me').pop();
  const line = `<div class="card"><div class="r"><span style="font-weight:500">${L.esc(L.title(t.description))}</span><b>${L.esc(L.money(t.amount))}</b></div><div class="hint">${L.esc(L.shortDate(t.date))} · ${L.esc(acct)}</div>${lastMe ? `<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px"><span class="hint">${L.esc(me)} wrote</span><br>${L.esc(lastMe.text).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
  if (post) {
    const pick = String(form.pick || ''); if (!['joint', 'partner', 'me', 'unsure'].includes(pick)) return html(400, L.pageShell('<h1>Pick an answer</h1>'));
    if ((q.messages || []).length > 40) return gone();
    const note = String(form.note || '').trim().slice(0, 1000);
    await base.collection('questions').doc(q.id).update({ messages: L.admin.firestore.FieldValue.arrayUnion({ from: 'partner', text: note, pick, at: new Date().toISOString(), via: 'page' }), suggestionDismissed: false });
    const to = q.ownerEmail, month = (t.date || '').slice(0, 7);
    if (to) { try { const mail = L.emailToOwner({ people, t, acct, pick, note, appUrl: `${L.SITE}/transactions/${month}?filter=questions`, asked: lastMe ? lastMe.text : '' }); await L.sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text }); } catch (e) { /* the app still shows the reply */ } }
    return html(200, L.pageShell(`<h1>Sent to ${L.esc(me)}</h1><p class="m">You answered: <b style="color:var(--ink)">${L.esc(L.pickWord(pick, people))}</b>.</p>${line}<p><a href="?t=${encodeURIComponent(token)}&a=${pick}">Change my answer</a></p>`));
  }
  const pre = ['joint', 'partner', 'me', 'unsure'].includes(form.a) ? form.a : '';
  const opt = (v, l) => `<label><input type="radio" name="pick" value="${v}"${pre === v ? ' checked' : ''} required><span>${L.esc(l)}</span></label>`;
  return html(200, L.pageShell(`<h1>${L.esc(me)} has a question</h1><p class="m">About a payment from the household account.</p>${line}<form method="post"><input type="hidden" name="t" value="${L.esc(token)}"><span class="lab">Whose is it?</span><div class="opts">${opt('joint', 'Household')}${opt('partner', 'Mine')}${opt('me', me + "'s")}${opt('unsure', 'Not sure')}</div><span class="lab">Add a note (optional)</span><textarea name="note" maxlength="1000" aria-label="Add a note"></textarea><button class="go" type="submit">Send to ${L.esc(me)}</button></form><p class="hint">Only this one payment is shown. No sign-in needed.</p>`));
};
