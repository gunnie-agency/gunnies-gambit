// The web fonts both pages use, Latin subsets only: the site is in English, and the other subsets of JetBrains Mono
// are small enough for Vite to inline as base64 into the render-blocking stylesheet.
// Instrument Sans: the variable weight axis (400 to 700). Its package has no Latin-only file; the Latin Extended face
// in it is a plain URL behind a unicode-range, so browsers only fetch it for text that needs it.
import '@fontsource-variable/instrument-sans/wght.css';
// Instrument Serif: the one italic accent.
import '@fontsource/instrument-serif/latin-400-italic.css';
// JetBrains Mono: 400 for moves, lines and inputs, 500 for eyebrows, 600 for the best move, scores and coordinates.
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
