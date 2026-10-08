/* Opens Razorpay Checkout and posts the signed result back for verification. */
(function () {
  'use strict';
  const btn = document.getElementById('rzp-pay');
  const optsEl = document.getElementById('rzp-options');
  if (!btn || !optsEl || typeof window.Razorpay !== 'function') return;

  const opts = JSON.parse(optsEl.textContent);
  const verify = document.getElementById('rzp-verify');

  const open = () => {
    const rzp = new window.Razorpay({
      ...opts,
      theme: { color: '#5a2a3d' },
      handler(response) {
        verify.razorpay_payment_id.value = response.razorpay_payment_id;
        verify.razorpay_order_id.value = response.razorpay_order_id;
        verify.razorpay_signature.value = response.razorpay_signature;
        verify.submit();
      },
    });
    rzp.open();
  };
  btn.addEventListener('click', open);
  open();
})();
