/* Cart + order request (builds a real mailto: link). Same behaviour as before, hardened:
   focus trap, Escape / scrim close, inert background, animated drawer, and the disabled
   "Send order request" link can no longer be activated from the keyboard. */
export function createCart({ catalog, orderEmail, $, money, reduce, onAdd }) {
  const items = [];
  const drawer = $('#drawer'), scrim = $('#scrim'), list = $('#cartList'), send = $('#sendOrder');
  const byId = (id) => catalog.find(x => x.id === id);
  let lastFocus = null, closeTimer = 0, opened = false;

  function render() {
    $('#cartCount').textContent = items.length;
    $('#cartBtn').setAttribute('aria-label', `Open cart, ${items.length} item${items.length === 1 ? '' : 's'}`);
    list.innerHTML = '';
    if (!items.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Your cart is empty. Add a watch to start an order request.'; list.append(li); }
    items.forEach((id, i) => {
      const c = byId(id), li = document.createElement('li'); li.innerHTML = `<span>${c.name} — ${money(c.price)}</span>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Remove'; b.setAttribute('aria-label', 'Remove ' + c.name);
      b.onclick = () => { items.splice(i, 1); render(); }; li.append(b); list.append(li);
    });
    const total = items.reduce((s, id) => s + byId(id).price, 0); $('#cartTotal').textContent = money(total);
    const on = items.length > 0;
    send.setAttribute('aria-disabled', on ? 'false' : 'true'); send.tabIndex = on ? 0 : -1;
    const body = 'I would like to order:\n' + items.map(id => '- ' + byId(id).name).join('\n') + '\n\nTotal: ' + money(total) + '\n\nName:\nShipping address:';
    send.href = on ? 'mailto:' + orderEmail + '?subject=' + encodeURIComponent('Order request') + '&body=' + encodeURIComponent(body) : '#';
  }
  send.addEventListener('click', e => { if (send.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

  const bg = () => [document.querySelector('main'), document.querySelector('.nav'), document.querySelector('.pager')].filter(Boolean);
  function open() {
    clearTimeout(closeTimer); lastFocus = document.activeElement;
    opened = true; drawer.hidden = false; scrim.hidden = false; bg().forEach(e => e.inert = true);
    void drawer.offsetWidth;                       // force reflow so the slide-in transition runs without waiting for a frame
    drawer.classList.add('open'); scrim.classList.add('open');
    $('#closeCart').focus({ preventScroll: true });
  }
  function close() {
    opened = false; drawer.classList.remove('open'); scrim.classList.remove('open'); bg().forEach(e => e.inert = false);
    const done = () => { drawer.hidden = true; scrim.hidden = true; };
    reduce ? done() : (closeTimer = setTimeout(done, 280));
    lastFocus && lastFocus.focus({ preventScroll: true });
  }
  const isOpen = () => opened;
  addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {                       // focus trap
      const f = [...drawer.querySelectorAll('button,a[href]')].filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  $('#cartBtn').onclick = open; $('#openCart2').onclick = open; $('#closeCart').onclick = close; scrim.onclick = close;
  document.addEventListener('click', e => {
    const b = e.target.closest('.add'); if (!b) return;
    const i = +b.dataset.i; items.push(catalog[i].id); render(); onAdd && onAdd(i, b);
  });
  render();
  return { open, close, items };
}
