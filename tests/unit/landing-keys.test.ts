import { describe, expect, it } from 'vitest';
import data from '../../src/plugin/generated/window-data.json';
import { COMPARISON } from '../../src/landing/content/compare.ts';
import { FAQ } from '../../src/landing/content/faq.ts';
import { FEATURES } from '../../src/landing/content/features.ts';
import { CONTESTED_KEYS } from '../../src/landing/content/pace.ts';
import { PIES } from '../../src/landing/content/pies.ts';
import { SETTINGS_SLIDES } from '../../src/landing/content/setup.ts';
import { SHORTCUTS } from '../../src/landing/content/shortcuts.ts';
import type { KeyTokens } from '../../src/landing/ui/KeyCap.tsx';

/** A contested key: the Editor command's key, where the Unity preset moves Blendon's, where Move puts the Editor's. */
interface Known {
  editorKey: string;
  blendonAlt: string;
  /** Empty when Blendon's command does the Editor's job, so there is nothing to move. */
  editorAlt: string;
  replaces: boolean;
}

const byBlendonId = new Map(data.contested.map((r) => [r.bid, r] as const));

const known = (id: string): Known | undefined => {
  const r = byBlendonId.get(id);
  return r && { editorKey: r.key, blendonAlt: r.blendonAlt, editorAlt: r.editorAlt, replaces: r.replaces };
};

/** Landing key tokens as a Unity binding: ['Shift', '~+', 'Mouse 2'] -> 'Shift+Mouse 2'. */
const binding = (tokens: KeyTokens) => tokens.filter((t) => !t.startsWith('~')).join('+');

describe('landing keys', () => {
  it('moves the Scale tool one modifier aside on the Blendon preset only', () => {
    const k = known('Blendon/Rotate/Grab');
    expect(k?.editorAlt).toBeTruthy();
    expect(binding(FEATURES.find((f) => f.id === 'scale')?.keys ?? [])).toBe(k?.editorAlt);
    const row = SHORTCUTS.find(([action]) => action === 'Scale tool');
    expect(binding(row?.[1] ?? [])).toBe(k?.editorAlt);
    expect(binding(row?.[2] ?? [])).toBe(k?.editorKey);
  });

  it('shows the Toggle Blendon key, the same on both presets', () => {
    const keys = data.keymap['Blendon/Toggle Blendon'];
    const row = SHORTCUTS.find(([action]) => action.startsWith('Toggle Blendon'));
    expect(keys?.b).toBeTruthy();
    expect(keys?.u).toBe(keys?.b);
    expect(binding(row?.[1] ?? [])).toBe(keys?.b);
    expect(row?.[2]).toBeUndefined();
  });

  it('shows where the Unity preset moves each single-key gesture', () => {
    const rows: [string, string][] = [
      ['Orbit', 'Blendon/Orbit Selected'],
      ['Quick Roll', 'Blendon/Orbit Selected/Quick Roll'],
      ['Pan', 'Blendon/Pan'],
      ['Vertex snap', 'Blendon/All Tools/Vertex Snap'],
      ['Virtual pivot', 'Blendon/All Tools/Pick Virtual Pivot'],
      ['Context menu', 'Blendon/Context Menu'],
    ];
    for (const [action, id] of rows) {
      const row = SHORTCUTS.find(([a]) => a === action);
      const k = known(id);
      expect(binding(row?.[1] ?? []), action).toBe(k?.editorKey);
      // The same key on both presets needs no Unity column.
      if (k?.blendonAlt === k?.editorKey) expect(row?.[2], action).toBeUndefined();
      else expect(binding(row?.[2] ?? []), action).toBe(k?.blendonAlt);
    }
  });

  it('lists contested keys as the plugin settles them', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known(row.id);
      expect(k, row.id).toBeDefined();
      expect(binding(row.keys), row.id).toBe(k?.editorKey);
      // A note instead of keys: Blendon's has none on the Unity preset, or keeps its own.
      if (typeof row.blendonTo === 'string') expect(['', k?.editorKey], row.id).toContain(k?.blendonAlt);
      else expect(binding(row.blendonTo), row.id).toBe(k?.blendonAlt);
      // No Move target: Blendon's command replaces the Editor's, and the row says what took its place.
      if (k?.editorAlt) expect(binding(row.unityTo as KeyTokens), row.id).toBe(k.editorAlt);
      else expect(row.unityTo, row.id).toMatch(/^(Replaced|Still there)/);
    }
  });

  it('spells keys the way Unity does', () => {
    const tokens = [
      ...FEATURES.flatMap((f) => f.keys),
      ...SHORTCUTS.flatMap(([, blendon, unity]) => [...blendon, ...(unity ?? [])]),
      ...CONTESTED_KEYS.flatMap((r) => [
        ...r.keys,
        ...(typeof r.blendonTo === 'string' ? [] : r.blendonTo),
        ...(typeof r.unityTo === 'string' ? [] : r.unityTo),
      ]),
      ...COMPARISON.flatMap((c) => c.keys),
      ...PIES.flatMap((p) => p.keys),
    ];
    for (const t of tokens) expect(t, t).not.toMatch(/^(LMB|MMB|RMB|Numpad\b)|\s\+\s/);
    // Combinations in running text too; a plain right-click or middle-drag stays in words.
    const prose = [
      ...FEATURES.map((f) => f.desc),
      ...FAQ.map((f) => f.a),
      ...SETTINGS_SLIDES.map((s) => s.desc),
      ...CONTESTED_KEYS.flatMap((r) => [r.unityTo, r.blendonTo].filter((t) => typeof t === 'string')),
      ...PIES.map((p) => p.note),
      ...COMPARISON.map((c) => c.blendon),
    ];
    for (const text of prose) expect(text, text).not.toMatch(/\b(LMB|MMB|RMB)\b|\b(Shift|Ctrl|Alt) \+ /);
  });

  it('has a Move target exactly where Blendon does not replace the command', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known(row.id);
      if (typeof row.blendonTo !== 'string') expect(k?.blendonAlt, row.id).toBeTruthy();
      expect(!!k?.editorAlt, row.id).toBe(!k?.replaces);
    }
  });
});
