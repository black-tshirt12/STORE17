import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Black T-Shirt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
        <h1>Black T-Shirt</h1>
        <p>Order flow demo. Add items to cart on your main site, then open this Next app at <code>/order</code> with the same session (or set sessionStorage.checkoutCart manually for testing).</p>
        <p><Link href="/order">Go to Checkout</Link></p>
      </main>
    </>
  );
}
