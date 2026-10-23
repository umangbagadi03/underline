// Dark / light switch. Default follows the computer's setting.

const KEY = 'underline-theme';

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function setupTheme(button) {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) document.documentElement.dataset.theme = saved;
  } catch {
    // Storage can be blocked; then we just follow the computer's setting.
  }
  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // ignore
    }
  });
}
