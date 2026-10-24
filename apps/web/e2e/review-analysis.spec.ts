import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, name: string) =>
  page.getByRole('grid', { name: /chess board/i }).getByRole('button', {
    name: new RegExp(`^${name},`),
  });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// 3...Nf6?? allows 4.Qxf7#: a known blunder at ply 6.
const SCHOLAR = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';

test('a bot game goes to Game Review', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/play/bots/pip?mode=friendly&color=w');
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(page.getByRole('table').getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Resign' }).click();
  const link = page.getByRole('link', { name: 'Game Review' });
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/review\?pgn=/);
  await page.goto(`${href}&depth=8`);
  const summary = page.getByRole('region', { name: 'Review summary' });
  await expect(summary).toBeVisible({ timeout: 90_000 });
  await expect(summary.getByLabel(/accuracy$/).first()).toHaveText(/^\d+(\.\d)?$/);
  await expect(page.getByRole('slider', { name: 'Evaluation graph' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('review a blunder: graph, coach, Show Moves and Retry Move', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/review?pgn=${encodeURIComponent(SCHOLAR)}&depth=10`);
  const graph = page.getByRole('slider', { name: 'Evaluation graph' });
  await expect(graph).toBeVisible({ timeout: 90_000 });

  // Click the graph at ply 6 (7 plies: x = 6/7 of the width).
  // The graph sits below the board, outside a 720px viewport.
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  await page.mouse.click(box.x + (box.width * 6) / 7, box.y + box.height / 2);
  await expect(graph).toHaveAttribute('aria-valuenow', '6');
  const coach = page.getByRole('region', { name: 'Coach' });
  await expect(coach).toContainText(/blunder/i);
  await expect(coach).toContainText('Nf6');

  await coach.getByRole('button', { name: 'Show Moves' }).click();
  await expect(coach).toContainText('Showing engine line');
  await coach.getByRole('button', { name: 'Stop' }).click();
  await expect(coach).not.toContainText('Showing engine line');

  await coach.getByRole('button', { name: 'Retry Move' }).click();
  const retry = page.getByRole('region', { name: 'Retry move' });
  await expect(retry).toContainText('Find the best move for Black');
  // The engine's best defence of f7 at depth 10 is one of these.
  for (const [from, to] of [
    ['g7', 'g6'],
    ['d8', 'e7'],
    ['d8', 'f6'],
  ] as const) {
    await square(page, from).click();
    await square(page, to).click();
    const outcome = retry.getByText(/^(Correct!|Not quite)/);
    await expect(outcome).toBeVisible();
    if ((await outcome.textContent())?.startsWith('Correct!')) break;
    await retry.getByRole('button', { name: 'Try again' }).click();
  }
  await expect(retry).toContainText('Correct!');
  await retry.getByRole('button', { name: 'Back to review' }).click();
  await expect(graph).toHaveAttribute('aria-valuenow', '6');
  expect(errors).toEqual([]);
});

test('analysis board: import, live engine, explorer and GIF export', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/analysis');
  await page.getByLabel('FEN or PGN').fill('1. e4 c5 2. Nf3 d6');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Moves' }).getByRole('button')).toHaveCount(4);

  const lines = page.getByRole('list', { name: 'Engine lines' }).getByRole('button');
  await expect(lines).toHaveCount(3, { timeout: 60_000 });
  // Live analysis deepens in steps on the real engine.
  await expect(page.getByText(/^Depth (1[2-9]|20)$/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Opening explorer' }).click();
  const explorer = page.getByRole('region', { name: 'Opening explorer' });
  const moves = explorer.getByRole('list', { name: 'Moves' }).getByRole('button');
  await expect(moves.first()).toBeVisible();
  await expect(moves.first()).toHaveAccessibleName(/^d4, .* games/);
  await expect(explorer.getByText('Main Line')).toBeVisible();

  // Playing the explorer's top move extends the line.
  await moves.first().click();
  await expect(page.getByRole('table', { name: 'Moves' }).getByRole('button')).toHaveCount(5);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download GIF' }).click();
  const gif = await download;
  await expect(page.getByRole('status').filter({ hasText: 'GIF downloaded' })).toBeVisible();
  const file = await gif.path();
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
  expect(bytes.length).toBeGreaterThan(5_000);
  expect(errors).toEqual([]);
});

test('analysis board: edit a position and analyse it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/analysis');
  await page.getByRole('button', { name: 'Edit position' }).click();
  const editor = page.getByRole('region', { name: 'Board editor' });
  const cell = (sq: string) => editor.getByRole('button', { name: new RegExp(`^${sq},`) });
  await editor.getByRole('button', { name: 'Clear board' }).click();
  for (const [piece, sq] of [
    ['White king', 'g1'],
    ['White queen', 'd1'],
    ['Black king', 'g8'],
  ] as const) {
    await editor.getByRole('button', { name: piece }).click();
    await cell(sq).click();
  }
  await editor.getByRole('button', { name: 'Analyse position' }).click();
  await expect(square(page, 'd1')).toHaveAccessibleName(/white queen/);
  // White is a queen up: the evaluation is clearly positive.
  await expect(
    page.getByRole('list', { name: 'Engine lines' }).getByRole('button').first(),
  ).toContainText(/^\+|^M/, { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('openings: search Najdorf and practise it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/openings');
  await page.getByRole('searchbox', { name: 'Search openings' }).fill('najdorf');
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(results.getByRole('listitem').first()).toContainText(
    'Sicilian Defense: Najdorf Variation',
  );
  await results
    .getByRole('link', { name: 'Practice Sicilian Defense: Najdorf Variation' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/analysis\?fen=.*&explorer=1/);
  await expect(square(page, 'a6')).toHaveAccessibleName(/black pawn/);
  await expect(page.getByRole('region', { name: 'Opening explorer' })).toBeVisible();
  expect(errors).toEqual([]);
});
