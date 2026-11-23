// Scheduled nightly (netlify.toml: 02:30). Netlify scheduled functions only run for 30 seconds, so this just starts the background function.
exports.handler = async () => {
  const site = (process.env.SITE_URL || process.env.URL || 'https://tranquil-gelato-873262.netlify.app').replace(/\/$/, '');
  if (!process.env.RESEARCH_KEY || !process.env.FEED_UID) return { statusCode: 200, body: 'research not configured' };
  const r = await fetch(site + '/.netlify/functions/research-background', { method: 'POST', headers: { 'x-research-key': process.env.RESEARCH_KEY, 'Content-Type': 'application/json' }, body: '{}' });
  return { statusCode: 200, body: 'started ' + r.status };
};
