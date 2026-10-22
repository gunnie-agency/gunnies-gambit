import './fonts';
import './style.css';
import { setupGameImport } from './import/view';
import { App } from './ui/app';
import { setupThemeToggle } from './ui/chrome';

setupThemeToggle();

const app = new App();
app.start();
setupGameImport(app);
// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { gambit: app });
