// Add a PDF by dropping it anywhere on the window, or with the "Add a PDF" button.

/**
 * options: { onFile(file), button, input, overlay }
 */
export function setupDrop(options) {
  const { onFile, button, input, overlay } = options;
  let depth = 0; // drag events fire for every child element, so we count them

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (file) onFile(file);
  });

  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('dragleave', () => {
    depth--;
    if (depth <= 0) overlay.classList.remove('show');
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    overlay.classList.remove('show');
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  });
}
