// Shared helpers for Ask about a line. Secrets come from Netlify environment variables only:
//   FIREBASE_SERVICE_ACCOUNT  the service key JSON (one line)
//   RESEND_API_KEY            Resend API key
//   ASK_FROM                  sender, e.g. "Kodu Finance <finance@alexihall.com>" (must be on a Resend-verified domain)
//   SITE_URL                  optional, default the live site
//   ASK_LIVE                  "1" = email the partner; anything else = test mode (email goes to Alexi only)
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) });
const db = admin.firestore();
const SITE = (process.env.SITE_URL || 'https://tranquil-gelato-873262.netlify.app').replace(/\/$/, '');
const DAYS14 = 14 * 86400000;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');
const sameHash = (token, hash) => { if (!token || !hash) return false; const a = Buffer.from(sha(token)), b = Buffer.from(String(hash)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const money = n => (n < 0 ? '−' : '') + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KEEP = /^(HMRC|ELC|HSBC|UK|VAT|DD|BT|EE|TV|NHS|DVLA|TFL|BBC|IKEA|DIY|PCP|ISA|ATM|PAYE|LTD|PLC|MBNA|AA|RAC)$/;
const title = s => { s = String(s || ''); return s !== s.toUpperCase() ? s : titleAll(s); };
const titleAll = s => String(s || '').split(/(\s+)/).map(w => KEEP.test(w) ? w : w.toLowerCase().replace(/(^|[\-\/&(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/^[a-z]/, c => c.toUpperCase())).join('');
const plain = n => '\u00a3' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }); };
const shortDate = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };

async function load(uid, qid) {
  const base = db.collection('users').doc(uid);
  const qs = await base.collection('questions').doc(qid).get(); if (!qs.exists) return null;
  const q = { id: qs.id, ...qs.data() };
  const ts = await base.collection('transactions').doc(q.txnId).get(); const t = ts.exists ? { id: ts.id, ...ts.data() } : null;
  const ps = await base.collection('settings').doc('profile').get(); const prof = ps.exists ? ps.data() : {};
  const people = prof.people || {};
  let acct = t && t.account || '';
  if (t && t.accountId) { const a = await base.collection('accounts').doc(t.accountId).get(); if (a.exists && a.data().name) acct = a.data().name; }
  return { base, q, t, people: { me: (people.me || 'Alexi').trim(), partner: (people.partner || 'Partner').trim(), partnerEmail: (people.partnerEmail || '').trim() }, acct };
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY, from = process.env.ASK_FROM;
  if (!key || !from) throw Object.assign(new Error('Email is not set up (RESEND_API_KEY / ASK_FROM).'), { code: 'not_configured' });
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: replyTo || undefined }) });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

const F = "'IBM Plex Sans',Arial,sans-serif", M = "'IBM Plex Mono',Menlo,monospace";
const wrap = (inner, preheader) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;background:#f7f6f2">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:28px 24px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><img src="${SITE}/icons/icon-192.png" width="28" height="28" alt="" style="display:block;border-radius:7px"></td><td style="font:600 15px/1 ${F};color:#1c1c1a">Kodu <span style="font-weight:400;color:#5e5d58">Finance</span></td></tr></table>
${inner}
</td></tr></table></td></tr></table></body></html>`;
const lineCard = (t, acct, who, text) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e2db;border-radius:12px"><tr><td style="padding:16px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:500 17px/24px ${F};color:#1c1c1a">${esc(title(t.description))}</td><td align="right" style="font:600 17px/24px ${F};color:#1c1c1a;white-space:nowrap">${esc(money(t.amount))}</td></tr><tr><td colspan="2" style="padding-top:2px;font:400 14px/20px ${F};color:#69685f">${esc(shortDate(t.date))} · ${esc(acct)}</td></tr></table>
${text ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #e4e2db"><tr><td style="padding-top:14px;font:400 16px/24px ${F};color:#1c1c1a"><span style="font-size:13px;color:#69685f">${esc(who)} wrote</span><br>${esc(text).replace(/\n/g, '<br>')}</td></tr></table>` : ''}
</td></tr></table>`;
const btn = (href, label, strong) => `<a href="${esc(href)}" style="display:block;text-align:center;padding:13px 10px;border:1.5px solid ${strong ? '#1c1c1a' : '#cfcdc5'};border-radius:8px;background:#ffffff;color:#1c1c1a;font:${strong ? 600 : 500} 16px/20px ${F};text-decoration:none">${esc(label)}</a>`;

function emailToPartner({ people, t, acct, text, link, reply, reminder, canReply }) {
  const L = p => link(p), me = people.me;
  const html = wrap(`<h1 style="margin:24px 0 6px;font:600 24px/30px ${F};color:#1c1c1a">${esc(me)} ${reminder ? 'is still waiting to hear about' : reply ? 'replied about' : 'has a question about'} a payment</h1>
<p style="margin:0 0 20px;font:400 16px/24px ${F};color:#5e5d58">Tap an answer below.</p>
${lineCard(t, acct, me, text)}
<p style="margin:24px 0 10px;font:500 12px/1 ${M};letter-spacing:.06em;text-transform:uppercase;color:#69685f">Whose is it?</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" style="padding:0 4px 8px 0">${btn(L('joint'), 'Household', 1)}</td><td width="50%" style="padding:0 0 8px 4px">${btn(L('partner'), 'Mine', 1)}</td></tr><tr><td width="50%" style="padding:0 4px 8px 0">${btn(L('me'), me + "'s", 1)}</td><td width="50%" style="padding:0 0 8px 4px">${btn(L('unsure'), 'Not sure', 0)}</td></tr></table>
<p style="margin:8px 0 0;font:400 14px/21px ${F};color:#5e5d58">Each button opens a short page where you can add a note before it's sent.${canReply ? ' Or just reply to this email, and ' + esc(me) + ' will see your words in the app.' : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e4e2db"><tr><td style="padding-top:16px;font:400 13px/19px ${F};color:#69685f">Sent from Kodu Finance, ${esc(me)} and ${esc(people.partner)}'s household money app, because ${esc(me)} asked you. The buttons only answer this one question and stop working after 14 days. No sign-in needed.</td></tr></table>`, 'Tap Household, Mine, ' + me + "'s or Not sure.");
  return { subject: reminder ? `Reminder: ${me} asked about ${title(t.description)}, ${plain(t.amount)}` : reply ? `${me} replied: ${title(t.description)}, ${plain(t.amount)}` : `${me} asked: what was ${title(t.description)}, ${plain(t.amount)}?`, html, text: `${me} asked about ${title(t.description)} ${money(t.amount)} (${shortDate(t.date)}, ${acct}).\n${text}\n\nAnswer: ${link('joint')} (Household), ${link('partner')} (Mine), ${link('me')} (${me}'s), ${link('unsure')} (Not sure)` };
}
function pickWord(p, people) { return p === 'joint' ? 'Household' : p === 'partner' ? people.partner + "'s" : p === 'me' ? people.me + "'s" : p === 'unsure' ? 'Not sure' : ''; }
function emailToOwner({ people, t, acct, pick, note, appUrl, asked }) {
  const word = pickWord(pick, people), P = people.partner;
  const html = wrap(`<h1 style="margin:24px 0 6px;font:600 24px/30px ${F};color:#1c1c1a">${esc(P)} replied</h1>
<p style="margin:0 0 20px;font:400 16px/24px ${F};color:#5e5d58">${word ? esc(P) + ' says ' + esc(title(t.description)) + ' is: <b style="color:#1c1c1a">' + esc(word) + '</b>.' : esc(P) + ' wrote back about ' + esc(title(t.description)) + '.'}</p>
${asked ? `<p style="margin:0 0 6px;font:400 15px/22px ${F};color:#5e5d58"><span style="font-size:13px;color:#69685f">You asked</span><br>${esc(asked)}</p>` : ''}${lineCard(t, acct, P, note)}
<p style="margin:12px 0 0;font:400 14px/21px ${F};color:#5e5d58">Nothing has changed yet. Apply ${esc(P)}'s answer in the app in one tap.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td><a href="${esc(appUrl)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#1c1c1a;color:#f7f6f2;font:600 16px/20px ${F};text-decoration:none">Open in Kodu Finance</a></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #e4e2db"><tr><td style="padding-top:16px;font:400 13px/19px ${F};color:#69685f">You asked about this line in Kodu Finance. You get one email per reply, never a digest.</td></tr></table>`, `${P} answered: ${word}`);
  return { subject: `${P} replied: ${title(t.description)} is ${word}`, html, text: `${P} replied about ${title(t.description)} ${money(t.amount)}: ${word}.${note ? '\n"' + note + '"' : ''}\nOpen: ${appUrl}` };
}

// reply page (no sign-in)
function pageShell(body) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kodu Finance</title><style>
:root{--ink:#1c1c1a;--ink-2:#5e5d58;--ink-3:#69685f;--bg:#f7f6f2;--surface:#fff;--line:#e4e2db;--ctl:#cfcdc5;--fill:#efede7}
@media (prefers-color-scheme:dark){:root{--ink:#f1efe8;--ink-2:#b8b6ae;--ink-3:#a09e96;--bg:#171715;--surface:#1f1f1c;--line:#34332f;--ctl:#55534d;--fill:#2a2926}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/24px 'IBM Plex Sans',Arial,sans-serif}.w{max-width:480px;margin:0 auto;padding:24px 16px 48px}
h1{font-weight:600;font-size:24px;line-height:30px;margin:20px 0 6px}.m{color:var(--ink-2)}.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 0}
.r{display:flex;justify-content:space-between;gap:12px}.r b{font-weight:600;white-space:nowrap}.hint{color:var(--ink-3);font-size:14px}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.opts label{display:block}.opts input{position:absolute;opacity:0}.opts span{display:block;text-align:center;padding:13px 10px;border:1.5px solid var(--ctl);border-radius:8px;background:var(--surface);font-weight:600;cursor:pointer}
.opts input:checked+span{background:var(--ink);color:var(--bg);border-color:var(--ink)}.opts input:focus-visible+span{outline:2px solid var(--ink);outline-offset:2px}
textarea{width:100%;min-height:84px;resize:none;border:1px solid var(--ctl);border-radius:8px;padding:12px;font-size:16px;line-height:1.45;font-family:inherit;color:var(--ink);background:var(--surface)}
.go{width:100%;margin-top:12px;padding:14px;border:0;border-radius:8px;background:var(--ink);color:var(--bg);font-weight:600;font-size:16px;line-height:20px;font-family:inherit;cursor:pointer}a{color:var(--ink)}.lab{font:500 12px/1 'IBM Plex Mono',Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:20px 0 4px;display:block}
</style></head><body><div class="w"><div style="display:flex;align-items:center;gap:10px"><img src="${SITE}/icons/icon-192.png" width="28" height="28" alt="" style="border-radius:7px"><b>Kodu <span style="font-weight:400;color:var(--ink-2)">Finance</span></b></div>${body}</div></body></html>`;
}
// Resend webhooks are signed with Svix: HMAC-SHA256 of "<id>.<timestamp>.<body>" using the base64 part of the whsec_ secret.
function verifyWebhook(headers, rawBody) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || ''; if (!secret) return false;
  const id = headers['svix-id'], ts = headers['svix-timestamp'], sig = headers['svix-signature'] || ''; if (!id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'), want = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return sig.split(' ').some(p => { const v = p.split(',')[1] || ''; const a = Buffer.from(v), b = Buffer.from(want); return a.length === b.length && crypto.timingSafeEqual(a, b); });
}
// the new words in an email reply: drop quoted text, signatures and "On ... wrote:" lines
function newWords(text) {
  const out = []; for (const line of String(text || '').replace(/\r/g, '').split('\n')) { if (/^>/.test(line) || /^On .+wrote:?$/i.test(line.trim()) || /^-{2,}\s*(original message|forwarded)/i.test(line.trim()) || /^From:\s/.test(line)) break; out.push(line); }
  return out.join('\n').trim().slice(0, 1000);
}
module.exports = { verifyWebhook, newWords, admin, db, SITE, DAYS14, esc, sha, newToken, sameHash, money, title, shortDate, longDate, load, sendMail, emailToPartner, emailToOwner, pickWord, pageShell };
