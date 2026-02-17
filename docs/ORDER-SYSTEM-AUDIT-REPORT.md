# Order System – Full Audit Report

**Date:** February 14, 2025  
**Scope:** Frontend (order form, cart, store) + Backend (Orders API) + mobile vs desktop behavior  
**Goal:** Identify why orders succeed on desktop but fail on mobile; propose and implement fixes including Next.js reorganization.

---

## 1. Executive Summary

| Finding | Detail |
|--------|--------|
| **Root cause** | On mobile, the **Orders API URL is often missing** when the user taps "Confirm Order". The front end then saves the order **only to localStorage** and never sends a POST to the server. The user sees "Order submitted successfully!" but the order never reaches the API. |
| **Why desktop works** | On desktop, `store-data.json` usually loads quickly (or was already cached), and/or `storeOrdersApiUrl` was set earlier (e.g. from Admin). So `getOrdersApiUrlWhenReady()` returns a URL and the POST is sent. |
| **Why mobile fails** | On mobile, `store-data.json` often loads slowly or fails (slow 3G/4G, timeouts, different base path). The fallback `<meta name="orders-api-url">` in `order.html` is **empty**. So the front end has no API URL and never calls `sendOrderToApi()`. |
| **Fix (current stack)** | Set the fallback Orders API URL in `order.html` (meta and/or form `data-orders-api-url`). Prefer moving to Next.js so the order page can POST to relative `/api/orders`, eliminating URL configuration. |

---

## 2. End-to-End Order Flow

### 2.1 Frontend (order.html + assets/js/order.js)

1. User fills form and taps **Confirm Order** → form `submit` event.
2. `handleSubmit()` runs:
   - `validateOrderForm()` (fullName, phone, city, cart from sessionStorage).
   - `buildOrderPayload()` (FormData + sessionStorage `checkoutCart` + `getCartTotal()`).
3. **API URL resolution** (`getOrdersApiUrlWhenReady()`):
   - Optional: sessionStorage cache (`orderApiUrlCache`).
   - Wait for `Store.ready` (initial fetch of `data/store-data.json`).
   - `Store.getOrdersApiUrl()` (from localStorage, set when store-data contains `ordersApiUrl`).
   - If empty: `Store.refreshFromRemote()` once, then re-check.
   - If still empty: fallback from `<meta name="orders-api-url">` or `#order-form[data-orders-api-url]`.
   - *(After fix: same-origin `/api/orders` when applicable.)*
4. If URL exists → `sendOrderToApi(apiUrl, orderData)` (POST, JSON, 20s timeout).
5. If no URL → order saved only to localStorage; user still sees success (misleading on mobile).

### 2.2 Backend (api/orders.js – Vercel serverless)

- **OPTIONS:** CORS preflight → 204 + CORS headers.
- **POST:** Parse body (object or JSON string), validate `fullName`/`phone`, append order to `data/store-data.json` via GitHub API, return `200 { success: true, ok: true, id }`.
- **CORS:** `Access-Control-Allow-Origin: <request origin>`, Methods GET/POST/OPTIONS, Headers Content-Type, Accept.

### 2.3 Data Dependencies

- **Cart at checkout:** `sessionStorage.checkoutCart` (set in `proceedToCheckout()` from `getCartData()`).
- **Orders API URL:** From `data/store-data.json` → `ordersApiUrl` → applied to localStorage `storeOrdersApiUrl` by `Store.applyRemoteData()`. Fallback: meta/form attribute (must be set for mobile).

---

## 3. Analysis: Why Mobile Fails

### 3.1 API URL Not Available

| Factor | Desktop | Mobile |
|--------|--------|--------|
| `store-data.json` load | Often fast (cache, stable network). | Often slow or fails (slow 3G/4G, timeouts, path issues). |
| `Store.ready` | Resolves quickly; `ordersApiUrl` applied. | May resolve after user has already submitted; or fetch fails. |
| localStorage `storeOrdersApiUrl` | May already be set (e.g. from Admin). | Depends only on current page’s store-data fetch. |
| Fallback meta/form | Often unnecessary. | **Critical** when store-data has no URL; currently **empty** in `order.html`. |

Result: On mobile, no API URL → no POST → order only in localStorage; user still sees success.

### 3.2 Request Construction (when URL *is* set)

- **Method:** POST. **Headers:** `Content-Type: application/json`, `Accept: application/json`. **Body:** `JSON.stringify(orderData)`.
- Same on desktop and mobile; no evidence of wrong method/headers. CORS is correctly handled by the API.
- **Timeout:** 20s with `AbortController` to avoid indefinite hang on slow networks.

### 3.3 Form and State

- Form: `action="#"`, `method="post"`, `onsubmit="return false;"`; script uses `addEventListener('submit', ...)` and `event.preventDefault()`.
- Validation and payload use the same logic on both devices. `submitInProgress` prevents double submit. No mobile-specific touch bug identified; the main issue is **missing API URL**, not form handling.

### 3.4 SessionStorage / Cart

- Cart is written in `proceedToCheckout()` and read in validation and payload. If sessionStorage is cleared or blocked (e.g. private mode), user gets "Your cart is empty" and redirect, not a silent success. So the primary problem remains **missing API URL**.

---

## 4. Verification Checklist (API and Requests)

- [x] **API route:** POST and OPTIONS implemented; body parsed for object or JSON string.
- [x] **CORS:** OPTIONS 204 + Allow-Origin (request origin), Allow-Methods, Allow-Headers. No extra auth.
- [x] **Validation:** `fullName` and `phone` required; `order` must be object.
- [x] **Fetch:** POST with JSON body; no axios; timeout 20s.
- [ ] **Orders API URL on client:** Must be set via meta/form or same-origin fallback so mobile always has a target.

---

## 5. Proposed Technical Solutions

### 5.1 Immediate (current static site)

1. **Set fallback Orders API URL** in `order.html`:
   - `<meta name="orders-api-url" content="https://YOUR-VERCEL-APP.vercel.app/api/orders" />`
   - and/or `data-orders-api-url="https://YOUR-VERCEL-APP.vercel.app/api/orders"` on `#order-form`.
2. **Same-origin fallback in order.js:** If no URL from Store or meta, use `window.location.origin + '/api/orders'` when the page is served from the same host that serves the API (e.g. one Vercel project with static + `api/` folder). Then mobile and desktop both POST without depending on store-data.
3. **Admin:** In GitHub Sync, set Orders API URL and sync so `store-data.json` contains `ordersApiUrl` for all devices when the file loads.

### 5.2 Next.js Reorganization (recommended)

- **Benefits:** Same-origin requests: order page POSTs to `/api/orders` (relative). No dependency on `store-data.json` or meta for the API URL. One deployment; consistent behavior on mobile and desktop.
- **Implementation:**
  - Next.js API route: `pages/api/orders.js` (or `app/api/orders/route.js`) with same logic as current `api/orders.js` (GitHub persistence, CORS for optional cross-origin use), plus structured logging and error handling.
  - Order page: Next.js page that submits to `/api/orders` via `fetch('/api/orders', { method: 'POST', ... })`. No URL configuration needed.
  - Optional: migrate cart/checkout into Next.js (e.g. context or localStorage + sessionStorage) for a single, stable stack.

### 5.3 Logging and Error Handling

- **Frontend:** Log when API URL is missing (so you can see mobile fallback usage); log POST start/success/failure and timeout; surface a clear message when order is saved locally only (no API).
- **Backend:** Log each POST (origin, user-agent snippet, order id); log body parse errors and GitHub errors with enough detail to debug.

---

## 6. Responsive and Mobile-Specific Checks

- No evidence of a mobile-only JS crash; logic is shared. Main risk is **timing** (Store.ready / store-data later or failed on mobile).
- Touch: Submit is triggered by button `type="submit"`; no separate touch handler required. Large tap target for submit button is recommended (already styled).
- Viewport: `order.html` has `viewport-fit=cover` and proper viewport meta; no obvious layout bug that would prevent submit.

---

## 7. Next.js Project Structure (Proposed)

```
next-app/
├── package.json
├── next.config.js
├── .env.local          # GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
├── pages/
│   ├── api/
│   │   └── orders.js   # POST handler; CORS; logging; GitHub persistence
│   ├── order.jsx       # Checkout page; POST to /api/orders
│   ├── index.jsx
│   └── ...
├── lib/
│   └── orders.js       # Optional: shared validation, GitHub helpers
└── public/
```

- **Stable:** One codebase; API URL is always `/api/orders` relative to the app.
- **Fast:** Same-origin request; no extra redirect. Optional caching for store-data.
- **Scalable:** Add more API routes (e.g. products, sync) and pages as needed.

---

## 8. Deliverables Summary

| Deliverable | Status |
|-------------|--------|
| Clear report identifying the real issue | This document (Sections 1–4). |
| Proposed technical solutions | Section 5 (immediate + Next.js) and Section 7 (structure). |
| Fixed code / modifications | order.html (meta/form URL), order.js (same-origin fallback, logging, errors), api/orders.js (logging), and new Next.js app with `/api/orders` and order page. |

---

## 9. References

- Existing: `docs/ORDERS-MOBILE-DEBUG-REPORT.md` (root cause and quick fix).
- API contract: POST body `{ fullName, phone, city?, notes?, items, total, date }`; response `200 { success: true, ok: true, id }`.
