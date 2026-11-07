/**
 * Generated avatars (DiceBear). An avatar is stored as "style:seed" and drawn
 * here, in the browser, as an SVG data URI: no network requests.
 * Designs: Avataaars by Pablo Stanley and Bottts by Pablo Stanley (free for
 * personal and commercial use); ToonHead by Johan Melin (CC BY 4.0, credited
 * in How to play). Expressions are limited to friendly ones.
 */
import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';
import * as bottts from '@dicebear/bottts';
import * as toonHead from '@dicebear/toon-head';
import { AVATAR_STYLES, type AvatarStyle } from '@ludo/protocol';

const SOFT_BACKGROUNDS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c1f0c4'];

function render(style: AvatarStyle | 'bot', seed: string): string {
  switch (style) {
    case 'avataaars':
      return createAvatar(avataaars, {
        seed,
        backgroundColor: SOFT_BACKGROUNDS,
        mouth: ['smile', 'default', 'twinkle'],
        eyes: ['default', 'happy', 'wink', 'squint'],
        eyebrows: ['default', 'defaultNatural', 'raisedExcited', 'raisedExcitedNatural', 'flatNatural'],
        // Natural skin tones only (the style also has cartoon yellow and orange).
        skinColor: ['614335', 'ae5d29', 'd08b5b', 'edb98a', 'ffdbb4'],
        facialHairProbability: 20,
        accessoriesProbability: 10,
      }).toDataUri();
    case 'toonHead':
      return createAvatar(toonHead, {
        seed,
        backgroundColor: SOFT_BACKGROUNDS,
        mouth: ['laugh', 'smile', 'agape'],
        eyes: ['happy', 'wide', 'wink', 'humble', 'bow'],
        eyebrows: ['raised', 'happy', 'neutral'],
      }).toDataUri();
    case 'bot':
      return createAvatar(bottts, { seed, backgroundColor: ['e2d9ca'] }).toDataUri();
  }
}

const cache = new Map<string, string | null>();

/** The picture for an avatar, or null when it isn't a generated one (an old emoji). */
export function avatarUri(avatar: string): string | null {
  const hit = cache.get(avatar);
  if (hit !== undefined) return hit;
  const [style, seed] = avatar.split(':');
  const known = style === 'bot' || (AVATAR_STYLES as readonly string[]).includes(style ?? '');
  const uri = known && seed ? render(style as AvatarStyle | 'bot', seed) : null;
  cache.set(avatar, uri);
  return uri;
}

/** A fresh random avatar in one of the player styles. */
export function randomAvatar(rand: () => number = Math.random): string {
  const style = AVATAR_STYLES[Math.floor(rand() * AVATAR_STYLES.length)]!;
  const seed = Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `${style}:${seed}`;
}
