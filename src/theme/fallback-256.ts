import type { ThemeTokenName, ThemeTokens } from "./theme-schema";

export type ThemeTokens256 = Record<ThemeTokenName, number>;

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const ANSI_CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

function parseHexColor(hexColor: string): RgbColor {
  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5, 7), 16);

  return { r, g, b };
}

function distance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function nearestCubeLevel(value: number): number {
  let bestLevel = ANSI_CUBE_LEVELS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const level of ANSI_CUBE_LEVELS) {
    const currentDistance = Math.abs(value - level);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestLevel = level;
    }
  }

  return bestLevel;
}

function cubeLevelIndex(level: number): number {
  return ANSI_CUBE_LEVELS.indexOf(level as (typeof ANSI_CUBE_LEVELS)[number]);
}

function cubeColorForIndex(index: number): RgbColor {
  const cubeIndex = index - 16;
  const r = Math.floor(cubeIndex / 36);
  const g = Math.floor((cubeIndex % 36) / 6);
  const b = cubeIndex % 6;

  return {
    r: ANSI_CUBE_LEVELS[r] ?? 0,
    g: ANSI_CUBE_LEVELS[g] ?? 0,
    b: ANSI_CUBE_LEVELS[b] ?? 0,
  };
}

function grayscaleForIndex(index: number): RgbColor {
  const value = 8 + (index - 232) * 10;
  return { r: value, g: value, b: value };
}

export function hexTo256(hexColor: string): number {
  const rgb = parseHexColor(hexColor);

  const cubeR = nearestCubeLevel(rgb.r);
  const cubeG = nearestCubeLevel(rgb.g);
  const cubeB = nearestCubeLevel(rgb.b);

  const cubeIndex = 16 + 36 * cubeLevelIndex(cubeR) + 6 * cubeLevelIndex(cubeG) + cubeLevelIndex(cubeB);
  const cubeDistance = distance(rgb, cubeColorForIndex(cubeIndex));

  const average = (rgb.r + rgb.g + rgb.b) / 3;
  const grayscaleIndex = Math.max(232, Math.min(255, Math.round((average - 8) / 10) + 232));
  const grayscaleDistance = distance(rgb, grayscaleForIndex(grayscaleIndex));

  return grayscaleDistance < cubeDistance ? grayscaleIndex : cubeIndex;
}

export function resolveTheme256(tokens: ThemeTokens): ThemeTokens256 {
  const fallback = {} as ThemeTokens256;

  for (const [tokenName, hexColor] of Object.entries(tokens)) {
    fallback[tokenName as ThemeTokenName] = hexTo256(hexColor);
  }

  return fallback;
}
