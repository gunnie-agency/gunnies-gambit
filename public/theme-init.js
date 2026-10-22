// Applies a stored light theme before first paint, so the page does not flash dark, and marks a stored "evaluation
// shown" (analysis mode or the play-mode setting, see src/state.ts), so on phones the eval bar's space is reserved
// from the start rather than pushing the board aside when the app script runs.
// A separate file rather than an inline script, so the Content-Security-Policy can stay at script-src 'self'.
try {
  if (localStorage.getItem('gunnies-gambit.theme') === 'light') document.documentElement.dataset.theme = 'light';
  const saved = JSON.parse(localStorage.getItem('gunnies-gambit.v2') ?? 'null');
  if (saved?.mode === 'analysis' || saved?.showEval === true) document.documentElement.dataset.evalbar = 'on';
} catch {
  // Storage blocked or unreadable: the defaults apply, dark theme and no evaluation.
}
