// Small helpers for building the page.

/** Find an element by id. */
export function byId(id) {
  return document.getElementById(id);
}

/** Make an element with an optional class and text. */
export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Make a button that runs `onClick`. */
export function button(label, className, onClick) {
  const element = el('button', className, label);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}
