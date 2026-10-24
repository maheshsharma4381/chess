import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name},`) });
const moveButtons = (page: Page) => page.getByRole('table').getByRole('button');

/** Fails the test on any console error or uncaught exception. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function center(page: Page, name: string) {
  const box = await square(page, name).boundingBox();
  if (!box) throw new Error(`no box for ${name}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('play a friendly game vs Pip with click, drag, keyboard, arrows and takeback', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/play/bots');
  await page.getByRole('link', { name: /^play pip/i }).click();
  await expect(page.getByRole('grid', { name: /chess board/i })).toBeVisible();
  await expect(page.getByRole('meter', { name: /evaluation/i })).toBeVisible();

  // 1. Click-to-move, then the real engine replies.
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(moveButtons(page)).toHaveCount(2);

  // 2. Drag and drop the knight.
  const g1 = await center(page, 'g1');
  const f3 = await center(page, 'f3');
  await page.mouse.move(g1.x, g1.y);
  await page.mouse.down();
  await page.mouse.move(f3.x, f3.y, { steps: 8 });
  await page.mouse.up();
  await expect(moveButtons(page)).toHaveCount(4);
  await expect(square(page, 'f3')).toHaveAccessibleName('f3, white knight');

  // 3. Keyboard: d2-d3.
  await square(page, 'd2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(moveButtons(page)).toHaveCount(6);

  // 4. Right-drag draws an arrow.
  const b1 = await center(page, 'b1');
  const c3 = await center(page, 'c3');
  await page.mouse.move(b1.x, b1.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c3.x, c3.y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('arrow-b1-c3')).toBeAttached();

  // 5. Take back the last pair of moves.
  await page.getByRole('button', { name: /take back/i }).click();
  await expect(moveButtons(page)).toHaveCount(4);

  expect(errors).toEqual([]);
});

test('queue a premove while the engine thinks, then it plays instantly', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/play/bots/engine-max?mode=friendly&color=w');
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  // Engine Max thinks ~1.5s: queue d2-d4 as a premove meanwhile.
  await square(page, 'd2').click();
  await square(page, 'd4').click();
  await expect(square(page, 'd4')).toHaveAttribute('data-premove', 'true');
  // After the reply the premove executes, then the engine answers again.
  await expect(moveButtons(page)).toHaveCount(4, { timeout: 45_000 });
  await expect(moveButtons(page).nth(2)).toHaveText(/d4/);
  // The opening banner names the opening.
  await expect(page.getByText(/^[A-E]\d\d$/)).toBeVisible();
  expect(errors).toEqual([]);
});
