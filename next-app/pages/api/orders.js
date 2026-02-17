/**
 * Next.js API Route: POST /api/orders (Pages Router)
 *
 * Orders API Handling:
 * 1. Receives orders via POST from both PC and mobile.
 * 2. Validates incoming data (Content-Type, body, fullName/phone).
 * 3. Saves the order to the database (GitHub store-data.json).
 * 4. Returns a clear success/error response.
 * 5. Detailed console.log for tracking order arrival.
 * 6. CORS handled for mobile/cross-origin requests.
 * 7. Ensures Content-Type is application/json.
 * 8. try/catch for proper error handling.
 *
 * Required env: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
 * Optional: GITHUB_BRANCH (default main), ADMIN_EMAIL, RESEND_API_KEY
 * Debug: set DEBUG_ORDERS=1 in env to include device in JSON response.
 */

const GITHUB_API = 'https://api.github.com';
const RESEND_API = 'https://api.resend.com';
const STORE_DATA_PATH = 'data/store-data.json';
const DEBUG_ORDERS = process.env.DEBUG_ORDERS === '1' || process.env.DEBUG_ORDERS === 'true';

function corsHeaders(origin) {
  const o = origin || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

function setCors(res, origin) {
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
}

/** Ensure JSON responses; call after setCors when sending JSON. */
function setJsonContentType(res) {
  res.setHeader('Content-Type', 'application/json');
}

async function getFile(owner, repo, path, branch, token) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub GET failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function putFile(owner, repo, path, content, sha, branch, token, message) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || 'Add order via Orders API',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * Send order notification email to admin via Resend API (no extra dependency).
 * Uses env: RESEND_API_KEY, ADMIN_EMAIL. If either is missing, skips email and returns.
 */
async function notifyAdminByEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = (process.env.ADMIN_EMAIL || '').trim();
  if (!apiKey || !toEmail) {
    console.log('[api/orders] Email skip: RESEND_API_KEY or ADMIN_EMAIL not set');
    return;
  }
  const items = (order.items || [])
    .map((i) => `• ${i.name || 'Item'} — ${i.size || '-'} / ${i.color || '-'} × ${i.quantity || 1} = ${((i.price || 0) * (i.quantity || 1))} MAD`)
    .join('\n');
  const html = `
    <h2>New order: ${order.id}</h2>
    <p><strong>Customer:</strong> ${escapeHtml(order.fullName || '-')}</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.phone || '-')}</p>
    <p><strong>City:</strong> ${escapeHtml(order.city || '-')}</p>
    ${order.notes ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <p><strong>Total:</strong> ${order.total != null ? order.total : '-'} MAD</p>
    <h3>Items</h3>
    <pre>${items || '—'}</pre>
    <p><small>Date: ${order.date || new Date().toISOString()}</small></p>
  `;
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Black T-Shirt Orders <onboarding@resend.dev>',
      to: [toEmail],
      subject: `New order ${order.id} — ${order.fullName || 'Customer'}`,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[api/orders] Resend error', res.status, err);
    return;
  }
  console.log('[api/orders] Admin notified by email', order.id);
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Parse request body: Next.js may provide req.body as object (when bodyParser parses JSON) or we read raw. */
function parseBody(req) {
  const raw = req.body;
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    if (raw.trim() === '') return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid JSON body');
    }
  }
  throw new Error('Unsupported body type');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer || 'https://example.com').origin : '*');
  const userAgent = req.headers['user-agent'] || '(none)';
  const device = /mobile|android|iphone|ipad|webos|blackberry/i.test(userAgent) ? 'mobile' : 'desktop';

  const sendJson = (status, body) => {
    setCors(res, origin);
    setJsonContentType(res);
    res.status(status).json(body);
  };

  try {
    if (req.method === 'OPTIONS') {
      setCors(res, origin);
      res.status(204);
      return res.end();
    }

    if (req.method !== 'POST') {
      console.log('[api/orders] Rejected: method not allowed', { method: req.method, device });
      sendJson(405, { error: 'Method not allowed', success: false });
      return;
    }

    const contentType = (req.headers['content-type'] || '').trim().toLowerCase();
    const isJson = contentType === 'application/json' || contentType.startsWith('application/json;');
    if (!isJson) {
      console.log('[api/orders] Rejected: invalid Content-Type', { contentType: req.headers['content-type'], device });
      sendJson(415, { error: 'Content-Type must be application/json', success: false });
      return;
    }

    console.log('[api/orders] Order request received', {
      device,
      origin: origin.slice(0, 60),
      contentType: req.headers['content-type'],
      userAgent: userAgent.slice(0, 80),
    });

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = (process.env.GITHUB_BRANCH || 'main').trim() || 'main';

    if (!token || !owner || !repo) {
      console.error('[api/orders] Missing env: GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO');
      sendJson(500, { error: 'Orders API not configured (missing env)', success: false });
      return;
    }

    let order;
    try {
      order = parseBody(req);
    } catch (e) {
      console.error('[api/orders] Body parse error', e.message, { device });
      sendJson(400, { error: 'Invalid JSON body', success: false });
      return;
    }

    if (!order || typeof order !== 'object') {
      console.error('[api/orders] Empty or non-object body', { device });
      sendJson(400, { error: 'Request body must be a JSON object', success: false });
      return;
    }

    if (!order.fullName && !order.phone) {
      console.error('[api/orders] Validation failed: missing fullName and phone', { device });
      sendJson(400, { error: 'Order must include fullName and phone', success: false });
      return;
    }

    order.id = order.id || 'ord-' + Date.now();
    order.status = order.status || 'pending';
    console.log('[api/orders] Order validated and accepted', {
      id: order.id,
      fullName: order.fullName,
      phone: order.phone,
      device,
      clientDevice: order._debugDevice,
    });

    const orderForDb = { ...order };
    delete orderForDb._debugDevice;
    const file = await getFile(owner, repo, STORE_DATA_PATH, branch, token);
    const content = Buffer.from(file.content, 'base64').toString('utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data.orders)) data.orders = [];
    data.orders.unshift(orderForDb);
    const newContent = JSON.stringify(data, null, 2);
    await putFile(owner, repo, STORE_DATA_PATH, newContent, file.sha, branch, token, 'Add order ' + order.id);
    console.log('[api/orders] Order saved to database', { id: order.id, device });

    try {
      await notifyAdminByEmail(order);
    } catch (emailErr) {
      console.error('[api/orders] Admin email failed (order already saved)', emailErr.message);
    }

    const successPayload = { success: true, ok: true, id: order.id };
    if (DEBUG_ORDERS) successPayload._debug = { device, clientDevice: order._debugDevice };
    sendJson(200, successPayload);
  } catch (err) {
    console.error('[api/orders] Unexpected error', err.message, err.stack);
    setCors(res, origin);
    setJsonContentType(res);
    res.status(500).json({
      error: 'Failed to process order',
      detail: err.message,
      success: false,
      ...(DEBUG_ORDERS && { _debug: { device } }),
    });
  }
}
