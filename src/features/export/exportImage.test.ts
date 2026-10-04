import { describe, expect, it } from 'vitest';
import { backgroundOf } from './exportImage';

describe('export background', () => {
  it('is independent from the theme of the drawing', () => {
    expect(backgroundOf({ theme: 'dark', background: 'transparent' })).toBeUndefined();
    expect(backgroundOf({ theme: 'light', background: 'theme' })).toBe('#ffffff');
    expect(backgroundOf({ theme: 'dark', background: 'theme' })).toBe('#0b1120');
    expect(backgroundOf({ theme: 'dark', background: 'custom', backgroundColor: '#ff0000' })).toBe('#ff0000');
  });
});
