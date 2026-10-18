import { describe, expect, it } from 'vitest';
import data from '../../src/plugin/generated/window-data.json';
import { FEATURES } from '../../src/landing/content/features.ts';
import { CONTESTED_KEYS } from '../../src/landing/content/pace.ts';
import { SHORTCUTS } from '../../src/landing/content/shortcuts.ts';
import type { KeyTokens } from '../../src/landing/ui/KeyCap.tsx';

// Contested keys from the plugin: `uMove` is where Move puts the Editor's command on the Blendon preset, `bMove`
// where the Unity preset puts Blendon's shortcut.
const known: Record<string, { key: string; uMove: string; bMove: string }> = Object.fromEntries(
  data.contested.map((r) => [r.bid, { key: r.key, uMove: r.editorAlt, bMove: r.blendonAlt }]),
);

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
    // On the Unity preset the Scale tool keeps the key Grab Rotate wants.
    expect(binding(SHORTCUTS.find(([action]) => action === 'Scale tool')?.[2] ?? [])).toBe(
      known['Blendon/Grab Rotate']?.key,
    );
  });

  it('shows where the Unity preset moves each single-key gesture', () => {
    const rows: [string, string][] = [
      ['Orbit', 'Blendon/Orbit Selected'],
      ['Quick Roll', 'Blendon/Quick Roll'],
      ['Pan', 'Blendon/Camera Pan'],
      ['Vertex snap', 'Blendon/Vertex Snap'],
      ['Virtual pivot', 'Blendon/Pick Virtual Pivot'],
      ['Context menu', 'Blendon/Context Menu'],
    ];
    for (const [action, id] of rows) {
      const row = SHORTCUTS.find(([a]) => a === action);
      expect(binding(row?.[1] ?? []), action).toBe(known[id]?.key);
      expect(binding(row?.[2] ?? []), action).toBe(known[id]?.bMove);
    }
  });

  it('lists contested keys as the plugin settles them', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known[row.id];
      expect(k, row.id).toBeDefined();
      expect(binding(row.keys), row.id).toBe(k?.key);
      expect(binding(row.blendonTo), row.id).toBe(k?.bMove);
      // An empty uMove: the Editor's command is switched off, and the row says what took its place.
      if (k?.uMove) expect(binding(row.unityTo as KeyTokens), row.id).toBe(k.uMove);
      else expect(typeof row.unityTo, row.id).toBe('string');
    }
  });
});
