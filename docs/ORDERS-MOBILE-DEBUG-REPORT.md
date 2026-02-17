# Orders: Mobile vs PC – Technical Debug Report

## Quick fix (do this first)

1. **Set the fallback Orders API URL** so mobile submissions always have a target:
   - Open **order.html**.
   - Set `<meta name="orders-api-url" content="https://YOUR-VERCEL-APP.vercel.app/api/orders" />` (replace with your real Vercel URL).
   - Or set the form attribute: `data-orders-api-url="https://YOUR-VERCEL-APP.vercel.app/api/orders"` on `#order-form`.
2. In **Admin → GitHub Sync**, set **Orders API URL** to the same URL and click **Sync now** so `store-data.json` contains it for all devices.

After that, test again on a phone (preferably on cellular). Orders should reach the server.

---

## Summary

**Root cause:** On mobile, the **Orders API URL** is often missing when the user taps "Confirm Order". The front end then saves the order **only to localStorage** and never sends a POST to the server. The user sees "Order submitted successfully!" but the order never reaches the API. On PC, the same URL is usually already available (e.g. from a prior admin session or faster `store-data.json` load), so the POST succeeds.

---

## 1. Frontend Analysis

### 1.1 Code responsible for sending orders

- **Page:** `order.html` – form `#order-form`, submit button `#submit-order-btn`.
- **Script:** `assets/js/order.js` – handles validation, payload build, and submission.

**Flow:**

1. User taps "Confirm Order" → form `submit` event.
2. `handleSubmit()` runs: `validateOrderForm()` → `buildOrderPayload()`.
3. **API URL resolution:** `getOrdersApiUrlWhenReady()`:
   - Waits for `Store.ready` (initial fetch of `data/store-data.json`).
   - Reads `Store.getOrdersApiUrl()` (from localStorage, set only when `store-data.json` contains `ordersApiUrl`).
   - If still empty, calls `Store.refreshFromRemote()` once (retry), then re-checks.
   - If still empty, uses **fallback:** `<meta name="orders-api-url" content="...">` or `#order-form[data-orders-api-url]`.
4. If URL exists → `sendOrderToApi(apiUrl, orderData)` (POST with JSON).
5. If no URL → order is saved only to localStorage; user still sees success.

### 1.2 PC vs mobile behavior

| Factor | PC | Mobile |
|--------|----|--------|
| **store-data.json load** | Often fast (desktop network, cache). | Often slow or fails (slow 3G/4G, timeouts, different base path in some setups). |
| **Store.ready** | Resolves quickly; `ordersApiUrl` applied from JSON. | May resolve late or after user has already tapped submit; or fetch fails so `ordersApiUrl` never set. |
| **localStorage** | May already have `storeOrdersApiUrl` from admin (same browser). | Clean session; no prior admin; depends only on current page’s store-data fetch. |
| **Fallback meta** | Not needed when store-data has URL. | Critical when store-data fails or has no `ordersApiUrl`; currently **empty** in `order.html`. |

So on mobile, the combination of (1) slow/failed `store-data.json` and (2) **empty fallback meta** means the front end often has **no API URL** and never POSTs.

### 1.3 fetch / form / validation

- **Request:** `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(orderData) })`. No axios.
- **Form:** `action="#"`, `method="post"`, `onsubmit="return false;"`; script uses `addEventListener('submit', ...)` and `event.preventDefault()`. No native form POST.
- **Validation:** `validateOrderForm()` checks fullName, phone (format), city, and cart from `sessionStorage.getItem('checkoutCart')`. Same logic on PC and mobile.
- **Touch/click:** Submit is triggered by the button’s `type="submit"`, which fires the form’s `submit` event on tap. No separate touch handler; none required for standard behavior. `submitInProgress` prevents double submission.

### 1.4 SessionStorage

- Cart is written in `proceedToCheckout()` and read in `validateOrderForm()` / `buildOrderPayload()`.
- On mobile, private/incognito or strict storage can clear or block sessionStorage; that would lead to "Your cart is empty" and redirect, not to a silent “success without server”. So the main issue is **missing API URL**, not sessionStorage.

---

## 2. Network Analysis

### 2.1 Intended request (when API URL is set)

- **Method:** POST  
- **Headers:** `Content-Type: application/json`, `Accept: application/json`  
- **Body:** JSON `{ fullName, phone, city, notes?, items, total, date }`  
- **Expected response:** `200` with `{ success: true, ok: true, id }`

### 2.2 Why the request may not happen on mobile

- If `getOrdersApiUrlWhenReady()` returns `null` (no URL from Store and no fallback), the code **never calls** `sendOrderToApi()`. So there is **no POST at all** from mobile in those cases; no difference in method/headers/body between PC and mobile when the POST does run.
- If the POST does run from mobile, possible issues are: **timeout** (mobile networks slower), **CORS** (handled below), or **mixed content** (handled by upgrading http→https in script).

### 2.3 Verifying whether the request reaches the server

- **Server (Vercel):** Check function logs for `[api/orders] POST request` and `[api/orders] Order saved`. If these never appear for a given order, the request did not reach the API.
- **Browser (mobile):** Use remote debugging (e.g. Chrome DevTools → remote device) or a tool like Eruda on the page; in Network tab, confirm whether a POST to the Orders API URL is sent and what status it returns.

---

## 3. Backend Analysis

### 3.1 API route and handler

- **File:** `api/orders.js` (Vercel serverless).
- **Method:** POST only; OPTIONS for CORS preflight.
- **Body:** Parsed via `parseBody(req)` – supports both pre-parsed object and raw string (JSON). Works for standard browser POST with `Content-Type: application/json`.

### 3.2 CORS

- **OPTIONS:** Responds with `204` and CORS headers.
- **Headers:** `Access-Control-Allow-Origin: <request origin>`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept`, `Access-Control-Max-Age: 86400`.
- **Origin:** Taken from `req.headers.origin` or from `Referer`; no auth required. Suitable for cross-origin POST from GitHub Pages or any domain.

No CORS change needed for mobile; the main problem is the request not being sent when the URL is missing.

### 3.3 Authentication / sessions / cookies

- No customer auth; no sessions or cookies required. Not the cause of mobile-only failure.

### 3.4 Rate limiting / firewall

- Not implemented in the provided code. If you add rate limiting or firewall rules later, ensure they do not block by User-Agent or mobile IP ranges.

---

## 4. Error Investigation

### 4.1 Mobile console errors

- **No API URL:** No error is thrown; the code falls back to “save to localStorage only” and shows success. So the user and the server see different outcomes.
- **Network error (when URL is set):** `sendOrderToApi` catches and logs; user sees a generic failure message. Adding a **timeout** (see below) avoids indefinite hang on slow mobile networks.

### 4.2 Possible JS/responsive bugs

- No evidence of a crash specific to mobile; the logic is the same. The only mobile-specific risk identified is **timing**: Store.ready and store-data fetch completing later or failing on mobile, leaving no API URL.

---

## 5. Root Cause and Fixes

### 5.1 Root cause (concise)

On mobile, **the Orders API URL is often not available** when the user submits (because `store-data.json` loads slowly or fails, and the fallback `<meta name="orders-api-url">` is **empty**). The front end then saves the order only to localStorage and does not send any request to the server.

### 5.2 Fixes applied in code

1. **order.html**  
   - Clarified comment and added `data-orders-api-url` on the form so you can set the fallback in one place (meta or data attribute).  
   - **Action required:** Set your Orders API URL in `<meta name="orders-api-url" content="https://YOUR-PROJECT.vercel.app/api/orders" />` and/or on the form `data-orders-api-url="https://YOUR-PROJECT.vercel.app/api/orders"` so mobile (and any device where store-data hasn’t loaded) still POSTs.

2. **order.js**  
   - **Fetch timeout:** POST uses `AbortController` with a 20s timeout so slow mobile networks don’t hang indefinitely; on timeout, the order is still saved to localStorage and the user gets a clear message.  
   - **Fallback message when no API URL:** When the order is saved only to localStorage (no API URL), the success message now indicates that the order was saved locally and the store will confirm (so you can optionally add a note in Admin or contact flow).  
   - **Session cache for API URL:** The first time the API URL is resolved (from Store or fallback), it is stored in `sessionStorage` for the rest of the session so a second submit or a slow Store.ready doesn’t lose the URL.

3. **api/orders.js**  
   - No functional change; CORS and body handling are already correct for mobile. Logging remains for debugging.

### 5.3 What you should do (checklist)

1. **Set the fallback Orders API URL**  
   In `order.html`, set:
   - `<meta name="orders-api-url" content="https://YOUR-VERCEL-APP.vercel.app/api/orders" />`  
   and/or  
   - On the form: `data-orders-api-url="https://YOUR-VERCEL-APP.vercel.app/api/orders"`.  
   Use your real Vercel deployment URL.

2. **Ensure store-data.json has the URL**  
   In Admin → GitHub Sync, set **Orders API URL** to the same URL and click **Sync now**. That updates `data/store-data.json` (including `ordersApiUrl`) so all devices get the URL when the file loads.

3. **Verify on mobile**  
   - Open the site on a phone (ideally on cellular).  
   - Add to cart, go to checkout, submit.  
   - In Vercel dashboard, check the serverless function logs for `[api/orders] POST request` and `[api/orders] Order saved` for that order.

4. **Optional: mobile debugging**  
   Use Chrome Remote Debugging (or similar) and watch the Network tab on the device to confirm the POST is sent and returns 200.

### 5.4 Future improvements

- **Monitoring:** Log or track when orders are saved to localStorage only (no API URL), so you can fix config if the fallback or sync is missing.  
- **Retry:** Optionally retry the POST once after a short delay if the first attempt times out or fails.  
- **Admin notice:** In the Orders section, show a short notice if the last sync failed or if `ordersApiUrl` is missing, with a link to GitHub Sync settings.

---

## 6. Request/response reference

**POST (when URL is set):**

- URL: `https://YOUR-PROJECT.vercel.app/api/orders`  
- Method: `POST`  
- Headers: `Content-Type: application/json`, `Accept: application/json`  
- Body:  
  `{ "fullName": "...", "phone": "...", "city": "...", "notes": "" | "...", "items": [...], "total": 123, "date": "2025-02-12T..." }`  

**Success:** `200` – `{ "success": true, "ok": true, "id": "ord-..." }`  

**Failure (examples):**  
- `400` – validation (e.g. missing fullName/phone, invalid JSON).  
- `500` – missing env (GITHUB_TOKEN etc.) or GitHub write error.

This document and the code changes together address the root cause and make mobile order submission reliable when the fallback URL is set and store-data is synced.
