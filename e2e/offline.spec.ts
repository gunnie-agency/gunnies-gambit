import { expect, test } from './fixtures';

test('answers every spelling of a page offline, and unknown addresses with the 404 page', async ({
  page,
  context,
  errors,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);

  const response = await page.goto('./index.html');
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#engineName')).toHaveText('Engine ready');

  for (const path of ['./how-to-play.html', './how-to-play/']) {
    const lesson = await page.goto(path);
    expect(lesson?.fromServiceWorker()).toBe(true);
    await expect(page).toHaveURL(/\/how-to-play$/);
    await expect(page.locator('[data-lesson="start"] [data-sq="e1"]')).toBeVisible();
  }

  const missing = await page.goto('./no/such/page');
  expect(missing?.status()).toBe(404);
  await expect(page.getByText('This page does not exist.')).toBeVisible();
  // The browser logs every 404 as a console error; this one is the point of the test.
  expect(errors).toEqual([expect.stringContaining('status of 404')]);
  errors.length = 0;

  await context.setOffline(false);
});
