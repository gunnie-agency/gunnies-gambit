// Applies a stored light theme before first paint, so the page does not flash dark.
// A separate file rather than an inline script, so the Content-Security-Policy can stay at script-src 'self'.
try {
  if (localStorage.getItem('gunnies-gambit.theme') === 'light') document.documentElement.dataset.theme = 'light';
} catch {
  // Storage blocked: the default dark theme applies.
}
