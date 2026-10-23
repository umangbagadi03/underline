// Small line icons (inline SVG, so they work offline). Use icon('lock') to get an element.

const PATHS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  marker: '<path d="M14.5 4.5l5 5L10 19H5v-5z"/><path d="M4 21h16"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 8.6A9 9 0 0 0 4 10.5M12 6.1a12 12 0 0 1 8 3.4M7.5 13.5a6 6 0 0 1 3-1.4M13.9 12.5a6 6 0 0 1 2.6 1.6"/><circle cx="12" cy="18" r="1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};

/** An icon element (a 24x24 line drawing that takes the text colour). */
export function icon(name, className = 'icon') {
  const wrap = document.createElement('span');
  wrap.className = className;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return wrap;
}

/** Turn every <span data-icon="name"> placeholder in the page into its icon. */
export function fillIcons(root = document) {
  for (const spot of root.querySelectorAll('[data-icon]')) {
    spot.replaceWith(icon(spot.dataset.icon, spot.className));
  }
}
