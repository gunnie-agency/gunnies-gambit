import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './style.css';
import { App } from './ui/app';
import { setupThemeToggle } from './ui/chrome';

setupThemeToggle();

const app = new App();
app.start();
// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { gambit: app });
