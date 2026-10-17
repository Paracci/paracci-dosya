/* Theme and contextual help. No document data, network, or extension commands. */
(function () {
  'use strict';
  const key = 'paracci-dosya.theme';
  let theme = 'dark';
  try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch { /* Storage can be disabled. */ }
  document.documentElement.dataset.theme = theme;
  function setup() {
    const toggle = document.getElementById('themeToggle');
    function apply() {
      document.documentElement.dataset.theme = theme;
      toggle.textContent = theme === 'dark' ? 'Tema: Koyu' : 'Tema: Açık';
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    }
    apply();
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark'; apply();
      try { localStorage.setItem(key, theme); } catch { /* Preference remains active for this page. */ }
    });
    const helps = [...document.querySelectorAll('.help')];
    const closeTimers = new WeakMap();
    function cancelClose(help) {
      if (closeTimers.has(help)) clearTimeout(closeTimers.get(help));
      closeTimers.delete(help);
    }
    function close(help) {
      cancelClose(help);
      help.classList.remove('is-open'); help.dataset.pinned = '';
      help.querySelector('button').setAttribute('aria-expanded', 'false');
    }
    function open(help) {
      cancelClose(help);
      helps.filter(item => item !== help).forEach(close);
      const button = help.querySelector('button'), tip = help.querySelector('[role="tooltip"]');
      help.classList.add('is-open'); button.setAttribute('aria-expanded', 'true');
      const rect = button.getBoundingClientRect(), padding = 16;
      tip.style.width = Math.min(340, window.innerWidth - padding * 2) + 'px';
      tip.style.left = Math.max(padding, Math.min(rect.left, window.innerWidth - tip.offsetWidth - padding)) + 'px';
      const below = rect.bottom + 10;
      tip.style.top = (below + tip.offsetHeight < window.innerHeight - padding ? below : Math.max(padding, rect.top - tip.offsetHeight - 10)) + 'px';
    }
    helps.forEach(help => {
      help.addEventListener('mouseenter', () => open(help));
      help.addEventListener('mouseleave', () => {
        if (!help.dataset.pinned && !help.contains(document.activeElement)) closeTimers.set(help, setTimeout(() => close(help), 160));
      });
      help.addEventListener('focusin', () => open(help));
      help.addEventListener('focusout', () => { setTimeout(() => { if (!help.contains(document.activeElement)) close(help); }, 0); });
      help.querySelector('button').addEventListener('click', () => {
        if (help.dataset.pinned) close(help);
        else { open(help); help.dataset.pinned = 'true'; }
      });
    });
    document.addEventListener('click', event => { if (!event.target.closest('.help')) helps.forEach(close); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') helps.forEach(close); });
    window.addEventListener('resize', () => helps.forEach(close));
    window.addEventListener('scroll', () => helps.forEach(close), { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
