# Next.js Order App

Order API and checkout page so submissions work reliably on **mobile and desktop**. Orders are sent to the same origin (`/api/orders`), so there is no dependency on `store-data.json` or meta tags for the API URL.

## Setup

1. **Install and run**
   ```bash
   npm install
   cp .env.example .env.local
   ```
   Edit `.env.local` and set:
   - `GITHUB_TOKEN` – Personal access token with `repo` scope
   - `GITHUB_OWNER` – GitHub username or org
   - `GITHUB_REPO` – Repository name (e.g. `tist`)
   - `GITHUB_BRANCH` – Optional; default `main`
   - **Optional (admin email):** `ADMIN_EMAIL` and `RESEND_API_KEY` – so each new order triggers an immediate email to you. Get a free key at [resend.com](https://resend.com).

2. **Run dev**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). Checkout: [http://localhost:3000/order](http://localhost:3000/order).

3. **Order page and cart**
   - The order page reads `sessionStorage.checkoutCart` (same format as the main site).
   - To test without the main site: in the browser console on `/order`, run:
     ```js
     sessionStorage.setItem('checkoutCart', JSON.stringify([
       { name: 'Black Tee', size: 'M', color: 'Deep Black', quantity: 1, price: 200 }
     ]));
     location.reload();
     ```

## API

- **POST /api/orders** – Body: `{ fullName, phone, city?, notes?, items, total, date }`. Responds `200 { success: true, ok: true, id }`. Saves the order to the server (appends to `data/store-data.json` in the GitHub repo) and, if `ADMIN_EMAIL` and `RESEND_API_KEY` are set, sends an immediate email notification to the admin. CORS is set so the route works from any device and from another domain if needed.

## Why this fixes mobile

- **Same origin:** The frontend posts to `/api/orders`, so the URL is always correct and does not depend on a slow or failed load of `store-data.json` or a meta tag.
- **Logging:** Server logs include `device: 'mobile' | 'desktop'` and order id for debugging.
- **Timeout:** Client uses a 20s timeout so slow networks don’t hang indefinitely.

## Deploy (e.g. Vercel)

1. Connect this folder (or the repo) to Vercel.
2. Add the same environment variables in Project → Settings → Environment Variables.
3. Deploy. The Orders API URL is `https://<your-project>.vercel.app/api/orders`. If you move your full storefront into this Next app, customers will post to the same origin automatically.
