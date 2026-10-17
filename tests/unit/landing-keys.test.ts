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

const rows = new Map(data.contested.map((r) => [r.bid, r] as const));

const known = (id: string): Known | undefined => {
  const r = rows.get(id);
  return r && { editorKey: r.key, blendonAlt: r.blendonAlt, editorAlt: r.editorAlt, replaces: r.replaces };
};

/** Landing key tokens as a Unity binding: ['Shift', '~+', 'Mouse 2'] -> 'Shift+Mouse 2'. */
const binding = (tokens: KeyTokens) => tokens.filter((t) => !t.startsWith('~')).join('+');

describe('landing keys', () => {
  it('leaves the Scale tool on its own key on the Blendon preset', () => {
    const k = known('Blendon/Grab Rotate');
    expect(k?.editorKey).toBeTruthy();
    expect(binding(FEATURES.find((f) => f.id === 'scale')?.keys ?? [])).toBe(k?.editorKey);
    // Grab Rotate only covers it in the Scene view, so both presets show the same key.
    const row = SHORTCUTS.find(([action]) => action === 'Scale tool');
    expect(binding(row?.[1] ?? [])).toBe(k?.editorKey);
    expect(binding(row?.[2] ?? [])).toBe(k?.editorKey);
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
      expect(binding(row?.[1] ?? []), action).toBe(known(id)?.editorKey);
      expect(binding(row?.[2] ?? []), action).toBe(known(id)?.blendonAlt);
    }
  });

  it('lists contested keys as the plugin settles them', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known(row.id);
      expect(k, row.id).toBeDefined();
      expect(binding(row.keys), row.id).toBe(k?.editorKey);
      expect(binding(row.blendonTo), row.id).toBe(k?.blendonAlt);
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
        ...r.blendonTo,
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
      ...CONTESTED_KEYS.flatMap((r) => (typeof r.unityTo === 'string' ? [r.unityTo] : [])),
      ...PIES.map((p) => p.note),
      ...COMPARISON.map((c) => c.blendon),
    ];
    for (const text of prose) expect(text, text).not.toMatch(/\b(LMB|MMB|RMB)\b|\b(Shift|Ctrl|Alt) \+ /);
  });

  it('has a Move target exactly where Blendon does not replace the command', () => {
    for (const row of CONTESTED_KEYS) {
      const k = known(row.id);
      expect(k?.blendonAlt, row.id).toBeTruthy();
      expect(!!k?.editorAlt, row.id).toBe(!k?.replaces);
    }
  });
});
