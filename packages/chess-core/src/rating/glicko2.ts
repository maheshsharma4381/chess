import type { GameResult, Glicko2Rating } from '@chess/types';

/** Glicko-2 per Glickman, "Example of the Glicko-2 system" (2012). */

const SCALE = 173.7178;
const CONVERGENCE = 0.000001;

export const GLICKO2_MAX_RD = 350;
export const DEFAULT_GLICKO2: Glicko2Rating = {
  rating: 1500,
  rd: GLICKO2_MAX_RD,
  volatility: 0.06,
};

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** Illinois-method root find for the new volatility (step 5 of the paper). */
function newVolatility(sigma: number, phi: number, v: number, delta: number, tau: number): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const denom = phi * phi + v + ex;
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * denom * denom) - (x - a) / (tau * tau)
    );
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Rates one rating period. With no games, only the deviation grows (step 6),
 * capped at {@link GLICKO2_MAX_RD}. `tau` constrains volatility change (0.3–1.2).
 */
export function updateGlicko2(
  player: Glicko2Rating,
  results: GameResult[],
  tau = 0.5,
): Glicko2Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const capRd = (rd: number) => Math.min(rd, GLICKO2_MAX_RD);

  if (results.length === 0) {
    const rd = Math.sqrt(phi * phi + player.volatility * player.volatility) * SCALE;
    return { ...player, rd: capRd(rd) };
  }

  let vInverse = 0;
  let improvement = 0;
  for (const { opponent, score } of results) {
    const muJ = (opponent.rating - 1500) / SCALE;
    const phiJ = opponent.rd / SCALE;
    const e = expected(mu, muJ, phiJ);
    vInverse += g(phiJ) ** 2 * e * (1 - e);
    improvement += g(phiJ) * (score - e);
  }
  const v = 1 / vInverse;
  const delta = v * improvement;

  const sigma = newVolatility(player.volatility, phi, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * improvement;

  return { rating: muNew * SCALE + 1500, rd: capRd(phiNew * SCALE), volatility: sigma };
}
