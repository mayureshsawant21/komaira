/* Komaira Boutique — storefront interactions (no dependencies) */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const csrf = document.body.dataset.csrf;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Toast ---------- */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(html, isError) {
    if (!toastEl) return;
    toastEl.innerHTML = html;
    toastEl.classList.toggle('is-error', Boolean(isError));
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Announcement rotator ---------- */
  const rotator = $('[data-rotator]');
  if (rotator) {
    const items = $$('.announcement-item', rotator);
    if (items.length > 1 && !reduceMotion) {
      let i = 0;
      setInterval(() => {
        items[i].classList.remove('is-active');
        i = (i + 1) % items.length;
        items[i].classList.add('is-active');
      }, 4000);
    }
  }

  /* ---------- Mobile menu ---------- */
  const menu = $('[data-menu]');
  const backdrop = $('[data-menu-backdrop]');
  const openBtn = $('[data-menu-open]');
  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle('is-open', open);
    backdrop.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  openBtn && openBtn.addEventListener('click', () => setMenu(true));
  $('[data-menu-close]') && $('[data-menu-close]').addEventListener('click', () => setMenu(false));
  backdrop && backdrop.addEventListener('click', () => setMenu(false));

  /* ---------- Search panel ---------- */
  const searchPanel = $('[data-search-panel]');
  $('[data-search-open]') && $('[data-search-open]').addEventListener('click', () => {
    searchPanel.hidden = !searchPanel.hidden;
    if (!searchPanel.hidden) $('input', searchPanel).focus();
  });
  $('[data-search-close]') && $('[data-search-close]').addEventListener('click', () => { searchPanel.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setMenu(false); if (searchPanel) searchPanel.hidden = true; }
  });

  /* ---------- Hero slider ---------- */
  const slider = $('[data-slider]');
  if (slider) {
    const slides = $$('.slide', slider);
    const dots = $$('[data-dot]', slider);
    const seconds = Number(slider.dataset.autoplay) || 0;
    slider.style.setProperty('--autoplay', seconds + 's');
    let index = 0;
    let timer = null;

    const go = (n) => {
      if (slides.length < 2) return;
      slides[index].classList.remove('is-active');
      slides[index].setAttribute('aria-hidden', 'true');
      $$('a', slides[index]).forEach((a) => a.setAttribute('tabindex', '-1'));
      dots[index] && (dots[index].classList.remove('is-active'), dots[index].setAttribute('aria-selected', 'false'));
      index = (n + slides.length) % slides.length;
      slides[index].classList.add('is-active');
      slides[index].removeAttribute('aria-hidden');
      $$('a', slides[index]).forEach((a) => a.removeAttribute('tabindex'));
      dots[index] && (dots[index].classList.add('is-active'), dots[index].setAttribute('aria-selected', 'true'));
      restart();
    };
    const restart = () => {
      clearTimeout(timer);
      if (seconds > 0 && slides.length > 1 && !slider.classList.contains('is-paused') && !reduceMotion) {
        timer = setTimeout(() => go(index + 1), seconds * 1000);
      }
    };
    $('[data-prev]', slider) && $('[data-prev]', slider).addEventListener('click', () => go(index - 1));
    $('[data-next]', slider) && $('[data-next]', slider).addEventListener('click', () => go(index + 1));
    dots.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.dot))));
    const pause = () => { slider.classList.add('is-paused'); clearTimeout(timer); };
    const resume = () => { slider.classList.remove('is-paused'); restart(); };
    slider.addEventListener('mouseenter', pause);
    slider.addEventListener('mouseleave', resume);
    slider.addEventListener('focusin', pause);
    slider.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(timer) : restart()));

    // Swipe on touch screens.
    let startX = null;
    slider.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
    if (reduceMotion) slider.classList.add('is-paused');
    restart();
  }

  /* ---------- Quantity steppers ---------- */
  $$('[data-qty]').forEach((box) => {
    const input = $('input[type=number]', box);
    $$('[data-step]', box).forEach((btn) => btn.addEventListener('click', () => {
      const min = Number(input.min || 0);
      const max = Number(input.max || 99);
      const next = Math.min(max, Math.max(min, (Number(input.value) || 0) + Number(btn.dataset.step)));
      if (next === Number(input.value)) return;
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  });

  /* ---------- Auto-submitting forms (filters, cart quantity) ---------- */
  $$('form[data-autosubmit]').forEach((form) => {
    let t;
    form.addEventListener('change', (e) => {
      if (e.target.matches('input[type=number][name=min], input[type=number][name=max]')) return;
      clearTimeout(t);
      t = setTimeout(() => form.requestSubmit ? form.requestSubmit() : form.submit(), 350);
    });
  });

  /* ---------- Cart count ---------- */
  function setCartCount(n) {
    $$('[data-cart-count]').forEach((el) => {
      el.textContent = n;
      el.classList.toggle('is-empty', !n);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  }

  /* ---------- Add to bag (AJAX with normal-form fallback) ---------- */
  $$('form[data-add-to-cart]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      if (e.submitter && e.submitter.name === 'buy_now') return; // let "Buy it now" post normally
      e.preventDefault();
      const btn = e.submitter || $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf },
          body: new URLSearchParams(new FormData(form)),
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setCartCount(data.count);
          toast(`${escapeHtml(data.message)} <a href="/cart">View bag</a>`);
        } else {
          toast(escapeHtml(data.error || 'Could not add this item.'), true);
        }
      } catch (err) {
        form.submit();
      } finally {
        btn.disabled = false;
      }
    });
  });

  /* ---------- Wishlist hearts ---------- */
  $$('form[data-wishlist]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf },
          body: new URLSearchParams(new FormData(form)),
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (res.status === 401) {
          toast(`Sign in to save favourites. <a href="${data.login}?next=${encodeURIComponent(location.pathname)}">Sign in</a>`);
          return;
        }
        const btn = $('button', form);
        btn.classList.toggle('is-saved', data.saved);
        const label = $('[data-wish-text]', form);
        if (label) label.textContent = data.saved ? 'Saved to wishlist' : 'Add to wishlist';
        toast(data.saved ? 'Saved to your wishlist. <a href="/account/wishlist">View</a>' : 'Removed from your wishlist.');
      } catch (err) {
        form.submit();
      }
    });
  });

  /* ---------- Product gallery ---------- */
  const gallery = $('[data-gallery]');
  if (gallery) {
    const main = $('[data-gallery-main]', gallery);
    $$('.thumb', gallery).forEach((t) => t.addEventListener('click', () => {
      $$('.thumb', gallery).forEach((x) => x.classList.remove('is-active'));
      t.classList.add('is-active');
      main.src = t.dataset.src;
      main.alt = t.dataset.alt;
    }));
  }

  /* ---------- Variant picker: live price & stock ---------- */
  const buyForm = $('form.buy-box');
  if (buyForm && buyForm.dataset.product) {
    const info = JSON.parse(buyForm.dataset.product);
    const fmt = (paise) => {
      const n = paise / 100;
      return info.currency + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    };
    const update = (radio) => {
      const price = Number(radio.dataset.price);
      const stock = Number(radio.dataset.stock);
      $('[data-price]').textContent = fmt(price);
      const nameEl = $('[data-variant-name]', buyForm);
      if (nameEl) nameEl.textContent = radio.dataset.name;
      const compare = $('[data-compare]');
      const save = $('[data-save]');
      const off = info.compare && info.compare > price ? Math.round(((info.compare - price) / info.compare) * 100) : 0;
      if (compare) compare.hidden = !off;
      if (save) { save.hidden = !off; save.textContent = `Save ${off}%`; }
      const line = $('[data-stock-line]', buyForm);
      if (stock <= 0) line.innerHTML = '<span class="stock-out">Out of stock</span>';
      else if (stock <= 5) line.innerHTML = `<span class="stock-low">Only ${stock} left — order soon</span>`;
      else line.innerHTML = '<span class="stock-in">In stock, ready to ship</span>';
      const qty = $('input[name=qty]', buyForm);
      qty.max = Math.min(10, Math.max(1, stock));
      if (Number(qty.value) > Number(qty.max)) qty.value = qty.max;
      $('[data-add-btn]', buyForm).disabled = stock <= 0;
      $('[data-buy-now]', buyForm).disabled = stock <= 0;
    };
    $$('input[name=variant_id]', buyForm).forEach((r) => r.addEventListener('change', () => update(r)));
  }

  /* ---------- Toggles (e.g. "Write a review") ---------- */
  $$('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const target = $(btn.dataset.toggle);
    if (!target) return;
    target.hidden = !target.hidden;
    if (!target.hidden) { const f = $('input, textarea', target); f && f.focus(); }
  }));
})();
