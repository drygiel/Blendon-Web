import { describe, expect, it } from 'vitest';
import data from '../../src/plugin/generated/window-data.json';
import { FEATURES } from '../../src/landing/content/features.ts';
import { CONTESTED_KEYS } from '../../src/landing/content/pace.ts';
import { SHORTCUTS } from '../../src/landing/content/shortcuts.ts';
import type { KeyTokens } from '../../src/landing/ui/KeyCap.tsx';

// Contested keys from the plugin: `uMove` is where the Editor's command goes on the Blendon preset.
const known: Record<string, { key: string; uMove: string; bMove: string }> = data.known;

const MOUSE: Record<string, string> = { LMB: 'Mouse 0', RMB: 'Mouse 1', MMB: 'Mouse 2' };

/** Landing key tokens as a Unity binding: ['Shift', '~+', 'MMB'] -> 'Shift+Mouse 2'. */
const binding = (tokens: KeyTokens) =>
  tokens
    .filter((t) => !t.startsWith('~'))
    .map((t) => MOUSE[t] ?? t)
    .join('+');

describe('landing keys', () => {
  it('shows the Scale tool where the Blendon preset moves it', () => {
    const moved = known['Blendon/Grab Rotate']?.uMove;
    expect(moved).toBeTruthy();
    expect(binding(FEATURES.find((f) => f.id === 'scale')?.keys ?? [])).toBe(moved);
    expect(binding(SHORTCUTS.find(([action]) => action === 'Scale tool')?.[1] ?? [])).toBe(moved);
  });

  it('lists contested keys as the plugin settles them', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known[row.id];
      expect(k, row.id).toBeDefined();
      expect(binding(row.keys), row.id).toBe(k?.key);
      expect(binding(row.blendonTo), row.id).toBe(k?.bMove);
      // An empty uMove: the Editor's command is switched off, and the row says what took its place.
      if (k?.uMove) expect(binding(row.unityTo as KeyTokens), row.id).toBe(k.uMove);
    }
    const orbit = CONTESTED_KEYS.find((r) => r.id === 'Blendon/Orbit Selected');
    expect(binding(orbit?.unityTo as KeyTokens)).toBe(known['Blendon/Camera Pan']?.key);
  });
});
