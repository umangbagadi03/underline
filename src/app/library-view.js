// The "Your documents" list in the sidebar.

import { el, button } from './dom.js';
import { icon } from './icons.js';

/**
 * Show the saved documents.
 * `handlers.open(id)` opens one, `handlers.remove(id)` deletes one.
 */
export function renderLibrary(list, docs, currentId, handlers) {
  list.replaceChildren();
  if (docs.length === 0) {
    list.appendChild(el('li', 'empty', 'No documents yet.'));
    return;
  }
  for (const doc of docs) {
    const item = el('li', doc.id === currentId ? 'active' : '');
    item.title = doc.name;
    item.appendChild(icon('file'));
    item.appendChild(el('span', 'doc-name', doc.name));
    item.appendChild(el('span', 'doc-pages', `${doc.pageCount} p`));
    const remove = button('✕', 'remove', (event) => {
      event.stopPropagation();
      handlers.remove(doc.id, doc.name);
    });
    remove.setAttribute('aria-label', `Delete ${doc.name}`);
    item.appendChild(remove);
    item.addEventListener('click', () => handlers.open(doc.id));
    list.appendChild(item);
  }
}
