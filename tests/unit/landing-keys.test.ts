import { describe, expect, it } from 'vitest';
import data from '../../src/generated/window-data.json';
import { FEATURES, SHORTCUTS, type KeyTokens } from '../../src/landing/data/content.ts';

// Contested keys from the plugin: `uMove` is where the Editor's command goes on the Blendon preset.
const known: Record<string, { key: string; uMove: string; bMove: string }> = data.known;

/** Landing key tokens as a Unity binding: ['Shift', '~+', 'R'] -> 'Shift+R'. */
const binding = (tokens: KeyTokens) => tokens.filter((t) => !t.startsWith('~')).join('+');

describe('landing keys', () => {
  it('shows the Scale tool where the Blendon preset moves it', () => {
    const moved = known['Blendon/Grab Rotate']?.uMove;
    expect(moved).toBeTruthy();
    expect(binding(FEATURES.find((f) => f.id === 'scale')?.keys ?? [])).toBe(moved);
    expect(binding(SHORTCUTS.find(([action]) => action === 'Scale tool')?.[1] ?? [])).toBe(moved);
  });
});
