/* Komaira Boutique — admin panel interactions */
(function () {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* Mobile sidebar */
  const sidebar = $('[data-sidebar]');
  const backdrop = $('[data-sidebar-close]');
  const setSidebar = (open) => { if (!sidebar) return; sidebar.classList.toggle('is-open', open); backdrop.hidden = !open; };
  $('[data-sidebar-open]') && $('[data-sidebar-open]').addEventListener('click', () => setSidebar(true));
  backdrop && backdrop.addEventListener('click', () => setSidebar(false));

  /* Confirm before destructive actions */
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (!window.confirm(f.dataset.confirm)) e.preventDefault();
  }));

  /* Print button on invoice */
  $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));

  /* Image previews for file inputs */
  $$('input[type=file][data-preview]').forEach((input) => {
    const target = $(input.dataset.preview);
    const zone = input.closest('.dropzone');
    if (zone) {
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.add('is-over')));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-over')));
    }
    input.addEventListener('change', () => {
      if (!target) return;
      target.innerHTML = '';
      Array.from(input.files).forEach((file) => {
        const tile = document.createElement('div');
        tile.className = 'image-tile';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = '';
        const cap = document.createElement('span');
        cap.textContent = file.name;
        tile.append(img, cap);
        target.append(tile);
      });
    });
  });

  /* Auto slug preview: fill the URL handle placeholder from the name */
  const slugSource = $('[data-slug-source]');
  const slugTarget = $('[data-slug-target]');
  if (slugSource && slugTarget) {
    const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    slugSource.addEventListener('input', () => { if (!slugTarget.value) slugTarget.placeholder = slugify(slugSource.value) || 'auto-generated'; });
  }

  /* Product variants */
  const variants = $('[data-variants]');
  if (variants) {
    const wireRow = (row) => {
      const hidden = $('input[name=variant_color]', row);
      const color = $('input[data-color]', row);
      const none = $('input[data-no-swatch]', row);
      const sync = () => { color.disabled = none.checked; hidden.value = none.checked ? '' : color.value; };
      color.addEventListener('input', sync);
      none.addEventListener('change', sync);
      sync();
      $('[data-remove-variant]', row).addEventListener('click', () => row.remove());
    };
    $$('.variant-row:not(.variant-head)', variants).forEach(wireRow);
    $('[data-add-variant]').addEventListener('click', () => {
      const node = $('#variant-template').content.firstElementChild.cloneNode(true);
      variants.append(node);
      wireRow(node);
      $('input[name=variant_name]', node).focus();
    });
  }

  /* Banner live preview */
  const bannerForm = $('[data-banner-form]');
  const preview = $('[data-banner-preview]');
  if (bannerForm && preview) {
    const update = () => {
      const f = bannerForm.elements;
      $('[data-bp=eyebrow]', preview).textContent = f.eyebrow.value;
      $('[data-bp=title]', preview).textContent = f.title.value || 'Your headline';
      $('[data-bp=subtitle]', preview).textContent = f.subtitle.value;
      const cta = $('[data-bp=cta_text]', preview);
      cta.textContent = f.cta_text.value;
      cta.hidden = !f.cta_text.value;
      preview.style.setProperty('--slide-bg', f.bg_color.value);
      preview.classList.remove('text-dark', 'text-light', 'align-left', 'align-center', 'align-right');
      preview.classList.add('text-' + f.text_theme.value, 'align-' + f.align.value);
    };
    bannerForm.addEventListener('input', update);
    bannerForm.addEventListener('change', update);
    const imgInput = $('[data-banner-image]', bannerForm);
    const img = $('[data-bp-img]', preview);
    imgInput && imgInput.addEventListener('change', () => {
      if (imgInput.files[0]) { img.src = URL.createObjectURL(imgInput.files[0]); img.hidden = false; }
    });
  }

  /* Charts (Chart.js loaded from CDN on dashboard/analytics pages) */
  function barChart(canvas, labels, values, opts) {
    if (!canvas || typeof window.Chart !== 'function') return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim() || '#2a78d6';
    // eslint-disable-next-line no-new
    new window.Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: opts.label, data: values, backgroundColor: color, hoverBackgroundColor: color, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 22, categoryPercentage: 0.85, barPercentage: 0.9 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: (ctx) => `${opts.label}: ${opts.format ? opts.format(ctx.parsed.y) : ctx.parsed.y}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#877b80', maxRotation: 0, autoSkipPadding: 14, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: '#f0ecea' }, border: { display: false }, ticks: { color: '#877b80', precision: 0, font: { size: 11 }, callback: (v) => (opts.format ? opts.format(v) : v) } },
        },
      },
    });
  }
  const shortDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  window.addEventListener('load', () => {
    const dash = $('#dashboard-data');
    if (dash) {
      const d = JSON.parse(dash.textContent);
      const labels = d.days.map((x) => shortDay(x.day));
      const money = (paise) => d.currency + Math.round(paise / 100).toLocaleString('en-IN');
      barChart($('#chart-visitors'), labels, d.days.map((x) => x.visitors), { label: 'Visitors' });
      barChart($('#chart-sales'), labels, d.days.map((x) => x.revenue), { label: 'Sales', format: money });
    }
    const an = $('#analytics-data');
    if (an) {
      const rows = JSON.parse(an.textContent);
      barChart($('#chart-traffic'), rows.map((x) => shortDay(x.day)), rows.map((x) => x.visitors), { label: 'Unique visitors' });
    }
  });
})();
