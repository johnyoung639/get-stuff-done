// Sends a push notification through ntfy using the JSON publish API (handles emoji in titles).
// Tolerate "ntfy.example.com" without a scheme by assuming https://
let NTFY_URL = (process.env.NTFY_URL || '').trim().replace(/\/+$/, '');
if (NTFY_URL && !/^https?:\/\//i.test(NTFY_URL)) NTFY_URL = 'https://' + NTFY_URL;
const NTFY_TOKEN = process.env.NTFY_TOKEN || '';
const APP_URL = process.env.APP_URL || '';
const KID_TOPIC = process.env.KID_TOPIC || 'gsd-kid';
const PARENT_TOPIC = process.env.PARENT_TOPIC || 'gsd-parents';

async function send(topic, { title, message, tags = [], priority = 3 }) {
  if (!NTFY_URL) {
    console.log(`[ntfy disabled] ${topic}: ${title} - ${message}`);
    return true; // treat as sent so the log still makes sense in local testing
  }
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}),
      },
      body: JSON.stringify({ topic, title, message, tags, priority, ...(APP_URL ? { click: APP_URL } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[ntfy] ${topic} failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[ntfy] ${topic} failed: ${e.message}`);
    return false;
  }
}

module.exports = { send, KID_TOPIC, PARENT_TOPIC, enabled: !!NTFY_URL };
