const crypto = require('crypto');
const config = require('../config');

function enabled() {
  return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
}

/** Creates a Razorpay order for `amount` paise. https://razorpay.com/docs/api/orders/create/ */
async function createGatewayOrder(amount, receipt) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', receipt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
  return data;
}

/** Verifies the checkout signature Razorpay returns after a successful payment. */
function verifySignature(gatewayOrderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${gatewayOrderId}|${paymentId}`).digest('hex');
  const sig = String(signature || '');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

module.exports = { enabled, createGatewayOrder, verifySignature };
