/** Page chrome outside the game: the header lockup and the light/dark switch. */

const THEME_KEY = 'gunnies-gambit.theme';

const SUN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

type Theme = 'dark' | 'light';

/** The header shows the Gunnie logo followed by the last word of the app name in the serif accent. */
export function renderBrand(): void {
  const accent = document.getElementById('brandAccent');
  const name = import.meta.env.VITE_APP_NAME.trim();
  if (accent) accent.textContent = name.slice(name.lastIndexOf(' ') + 1);
}

/** Dark is the default, as on gunnie.nl. The choice is a per-browser convenience. */
export function setupThemeToggle(): void {
  const button = document.getElementById('themeBtn');
  if (!button) return;
  const apply = (theme: Theme) => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    const next = theme === 'light' ? 'dark' : 'light';
    button.innerHTML = theme === 'light' ? MOON : SUN;
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = `Switch to ${next} theme`;
  };
  apply(storedTheme());
  button.addEventListener('click', () => {
    const theme: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    apply(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not remembered in private mode; the switch still works for this visit.
    }
  });
}

function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
