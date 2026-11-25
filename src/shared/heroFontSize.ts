// src/shared/heroFontSize.ts
//
// Font size for the big hero numbers (results screens, Your Fury points),
// picked from the string length. A fixed lineHeight plus adjustsFontSizeToFit
// can shrink text far below minimumFontScale on the new architecture, so
// these heroes size themselves instead of relying on auto-shrink.

/** Size and line height for a hero showing `value` plus an optional suffix. */
export function heroFontSize(value: string, suffix?: string): { fontSize: number; lineHeight: number } {
  const length = value.length + (suffix ? suffix.length : 0);
  const fontSize = length <= 6 ? 54 : length <= 8 ? 44 : 36;
  return { fontSize, lineHeight: fontSize + 1 };
}
