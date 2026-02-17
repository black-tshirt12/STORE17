# WhatsApp Orders (wa.me)

Orders are sent via a **WhatsApp link** only. There is no backend, no API, and no webhooks.

## How It Works

1. You set your **WhatsApp number** (country code + number, e.g. `212600000000`) in **Admin Dashboard → GitHub Sync**.
2. When a customer clicks **Confirm Order**, the site:
   - Collects the form data (name, phone, city, notes, cart items, total).
   - Builds a formatted text message.
   - Opens WhatsApp with: `https://wa.me/WHATSAPP_NUMBER?text=ENCODED_MESSAGE`
3. The customer is redirected to WhatsApp (app or web) with the message ready. They press **Send** inside WhatsApp to complete the order.

No server, no fetch, no POST—only a direct link to wa.me.

## Message Format

The pre-filled message includes:

- Name, phone, city, notes
- List of items (name, size, color, quantity, price)
- Total in MAD

Example:

```
New order
Name: Yassine
Phone: +212 612 345 678
City: Casablanca
Notes: Please call before delivery

Items:
- Black Tee / Classic Fit · Size: M · Color: Deep Black · Qty: 2 · 400 MAD

Total: 400 MAD
```

## Setup

1. Open **Admin Dashboard → GitHub Sync**.
2. In **WhatsApp number (for orders)**, enter your number with country code **only** (e.g. `212600000000`).
   - No `+`, no `https://`, no `wa.me`.
3. Click **Save settings**.
4. (Optional) Click **Sync now** so the number is saved to `data/store-data.json` and used on all devices.

You can change this number at any time from the Admin Dashboard.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Customer sees "WhatsApp number is not set" | Set the number in Admin → GitHub Sync and save. Sync to GitHub if you use store-data.json. |
| Wrong number receives orders | Update the WhatsApp number in Admin → GitHub Sync and save. |
