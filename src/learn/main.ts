import '../fonts';
import '../style.css';
import { registerServiceWorker } from '../sw/register';
import { setupThemeToggle } from '../ui/chrome';
import { mountLessons } from './view';

// The How to play page: no engine, only the practice boards.
registerServiceWorker();
setupThemeToggle();
mountLessons();
