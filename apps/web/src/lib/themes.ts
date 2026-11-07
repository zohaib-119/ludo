/**
 * Personal look: board, piece and dice designs. Chosen per player and kept in
 * this browser only (localStorage via personal settings) — the server never
 * knows, so every player can see the game in their own style.
 * All designs are drawn in code (SVG/CSS): nothing to download or license.
 */
import type { Color } from '@ludo/engine';

type Palette = Record<Color, string>;

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  /** Board paper, the inner yard trays and the frame around the board. */
  paper: string;
  tray: string;
  cell: string;
  grid: string;
  frame: string;
  frameRing: string;
  /** Player colours on this board: main, light (yard slots), dark (outlines). */
  base: Palette;
  light: Palette;
  dark: Palette;
}

export type BoardThemeId = 'classic' | 'wood' | 'pastel' | 'royal' | 'night';
export type PieceStyleId = 'glossy' | 'flat' | 'pawn' | 'gem' | 'coin';
export type DiceStyleId = 'tinted' | 'ivory' | 'casino' | 'wood' | 'neon';

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    paper: '#FFFDF8',
    tray: '#FFFDF8',
    cell: '#FFFFFF',
    grid: '#D9CFBE',
    frame: '#E9DFCD',
    frameRing: '#D4C7B0',
    base: { red: '#E03131', green: '#2B9348', yellow: '#F2B705', blue: '#1C7ED6' },
    light: { red: '#FFD3D3', green: '#C3F0CC', yellow: '#FFEDA6', blue: '#C5E3FF' },
    dark: { red: '#A61E1E', green: '#1B5E2E', yellow: '#A67C00', blue: '#105A9C' },
  },
  wood: {
    id: 'wood',
    name: 'Wooden',
    paper: '#E8CFA2',
    tray: '#F2DFBC',
    cell: '#F5E6C8',
    grid: '#B58A57',
    frame: '#8A5A2E',
    frameRing: '#5E3A18',
    base: { red: '#B83A2E', green: '#3F7A3D', yellow: '#D49A1B', blue: '#2F638F' },
    light: { red: '#E9B7A6', green: '#BCD7AF', yellow: '#F1D79B', blue: '#AFC8DD' },
    dark: { red: '#7A2219', green: '#254D24', yellow: '#8C620C', blue: '#1B3E5C' },
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    paper: '#FFFFFF',
    tray: '#FFFFFF',
    cell: '#FFFFFF',
    grid: '#E7E2F2',
    frame: '#EFEAFB',
    frameRing: '#DCD3F3',
    base: { red: '#F28B82', green: '#7FCB98', yellow: '#F9D46B', blue: '#8AB4F8' },
    light: { red: '#FDE2DF', green: '#DAF2E2', yellow: '#FEF3D2', blue: '#DDE9FD' },
    dark: { red: '#C9574D', green: '#3E9B63', yellow: '#C79A1F', blue: '#4C7FD1' },
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    paper: '#F8F1DE',
    tray: '#FFF9EA',
    cell: '#FFFBF0',
    grid: '#C9A227',
    frame: '#5B1A1A',
    frameRing: '#C9A227',
    base: { red: '#9B111E', green: '#046307', yellow: '#D9A400', blue: '#0F52BA' },
    light: { red: '#E8B6BB', green: '#A9D3AB', yellow: '#F3DE93', blue: '#AFC6EC' },
    dark: { red: '#5E0A12', green: '#023A04', yellow: '#8A6800', blue: '#08306E' },
  },
  night: {
    id: 'night',
    name: 'Night',
    paper: '#1B1F2E',
    tray: '#141725',
    cell: '#252A3C',
    grid: '#3A415A',
    frame: '#0E1019',
    frameRing: '#2E3550',
    base: { red: '#FF4D6D', green: '#2EE59D', yellow: '#FFD23F', blue: '#3D9BFF' },
    light: { red: '#5C2333', green: '#1A4A39', yellow: '#5A4A1A', blue: '#1B3A5E' },
    dark: { red: '#B3203D', green: '#14996A', yellow: '#B38F12', blue: '#1E63B8' },
  },
};

export const PIECE_STYLES: Array<{ id: PieceStyleId; name: string }> = [
  { id: 'glossy', name: 'Glossy' },
  { id: 'flat', name: 'Flat' },
  { id: 'pawn', name: 'Pawn' },
  { id: 'gem', name: 'Gem' },
  { id: 'coin', name: 'Coin' },
];

export interface DiceLook {
  face: string;
  pip: string;
  edge: string;
  /** Glow around pips (neon). */
  glow?: string;
}

export const DICE_STYLES: Array<{ id: DiceStyleId; name: string }> = [
  { id: 'tinted', name: 'Tinted' },
  { id: 'ivory', name: 'Ivory' },
  { id: 'casino', name: 'Casino' },
  { id: 'wood', name: 'Wooden' },
  { id: 'neon', name: 'Neon' },
];

const TINT_FACE: Palette = { red: '#ffd8d8', green: '#c9f5d1', yellow: '#fff1b3', blue: '#c4e3ff' };
const TINT_PIP: Palette = { red: '#a61e1e', green: '#1b5e2e', yellow: '#8a6700', blue: '#105a9c' };
const NEON_PIP: Palette = { red: '#FF4D6D', green: '#2EE59D', yellow: '#FFD23F', blue: '#3D9BFF' };

/** Colours for one die in a style. `color` is whose die it is (null = neutral). */
export function diceLook(style: DiceStyleId, color: Color | null): DiceLook {
  switch (style) {
    case 'ivory':
      return { face: '#FFFDF5', pip: '#1D1B18', edge: 'rgb(0 0 0 / 0.12)' };
    case 'casino':
      return { face: '#C8102E', pip: '#FFFFFF', edge: 'rgb(0 0 0 / 0.25)' };
    case 'wood':
      return { face: '#D9A86C', pip: '#3E2A14', edge: 'rgb(62 42 20 / 0.35)' };
    case 'neon': {
      const pip = color ? NEON_PIP[color] : '#7CF9FF';
      return { face: '#141725', pip, edge: 'rgb(255 255 255 / 0.12)', glow: pip };
    }
    case 'tinted':
    default:
      return color
        ? { face: TINT_FACE[color], pip: TINT_PIP[color], edge: 'rgb(0 0 0 / 0.12)' }
        : { face: '#fbf8f2', pip: '#1d1b18', edge: 'rgb(0 0 0 / 0.12)' };
  }
}
