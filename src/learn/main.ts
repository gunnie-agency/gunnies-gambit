import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '../style.css';
import { setupThemeToggle } from '../ui/chrome';
import { mountLessons } from './view';

// The How to play page: no engine, only the practice boards.
setupThemeToggle();
mountLessons();
