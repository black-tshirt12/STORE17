import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { submitOrder, getClientDevice } from '../lib/submitOrder';

const TIMEOUT_MS = 20000;

function getCartFromStorage() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem('checkoutCart') || '[]';
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getCartTotal(items) {
  return (items || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
}

export default function OrderPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const items = getCartFromStorage();
    setCartItems(items);
    setTotal(getCartTotal(items));
  }, [mounted]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const form = e.target;
    const fullName = (form.fullName && form.fullName.value || '').trim();
    const phone = (form.phone && form.phone.value || '').trim();
    const city = (form.city && form.city.value || '').trim();
    const notes = (form.notes && form.notes.value || '').trim();

    if (!fullName || !phone || !city) {
      setError('Please enter full name, phone, and city.');
      return;
    }
    if (!/^[0-9+\s-]+$/.test(phone)) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (!cartItems.length) {
      setError('Your cart is empty. Add products before checkout.');
      return;
    }

    setError(null);
    setSubmitting(true);

    const orderData = {
      fullName,
      phone,
      city,
      notes,
      items: cartItems,
      total,
      date: new Date().toISOString(),
    };

    try {
      const clientDevice = getClientDevice();
      // Temporary debug: in browser console run window.__DEBUG_ORDERS = true to log device (PC vs mobile).
      if (typeof window !== 'undefined' && window.__DEBUG_ORDERS) {
        console.log('[order] Submitting from client device:', clientDevice);
      }
      const result = await submitOrder(orderData, {
        timeout: TIMEOUT_MS,
        includeDebug: true,
      });
      if (result._debug && typeof window !== 'undefined' && window.__DEBUG_ORDERS) {
        console.log('[order] API debug response:', result._debug);
      }

      if (result.success && result.id) {
        try {
          window.sessionStorage.removeItem('checkoutCart');
        } catch {}
        alert('Order submitted successfully! We will contact you soon.');
        router.push('/');
        return;
      }
      setError(result.error || 'Order could not be saved. Please try again or contact us.');
    } catch (err) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <>
        <Head><title>Checkout | Black T-Shirt</title></Head>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Your cart is empty.</p>
          <a href="/">Browse products</a>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Checkout | Black T-Shirt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1rem' }}>
        <h1>Complete Your Order</h1>
        <p>Please fill in your details. We&apos;ll contact you to confirm delivery.</p>

        <section style={{ marginBottom: '2rem' }}>
          <h2>Order Summary</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cartItems.map((item, i) => (
              <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid #333' }}>
                {item.name} — {item.size} · {item.color} · {item.quantity} × {item.price} MAD = {(item.price * item.quantity)} MAD
              </li>
            ))}
          </ul>
          <p><strong>Total: {total} MAD</strong></p>
        </section>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="fullName">Full Name *</label>
            <input id="fullName" name="fullName" type="text" required placeholder="Your full name" autoComplete="name" style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div>
            <label htmlFor="phone">Phone *</label>
            <input id="phone" name="phone" type="tel" required placeholder="+212 6XX XXX XXX" autoComplete="tel" style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div>
            <label htmlFor="city">City / Delivery location *</label>
            <input id="city" name="city" type="text" required placeholder="e.g. Casablanca, Marrakech" autoComplete="address-level2" style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" rows={3} placeholder="Delivery instructions..." style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          {error && <p style={{ color: '#e53935' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: '0.75rem', cursor: submitting ? 'wait' : 'pointer' }}>
            {submitting ? 'Submitting...' : 'Confirm Order'}
          </button>
        </form>
      </main>
    </>
  );
}
