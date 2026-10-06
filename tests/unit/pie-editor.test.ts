import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ActionCatalog } from '../../src/scene/blendon/piemenus/actions.ts';
import { BuiltInPies } from '../../src/scene/blendon/piemenus/built-in-pies.ts';
import {
  actionLeaves,
  assign,
  defaultDraft,
  EditorIcons,
  guessIcon,
  hasIcon,
  naturalName,
  slotLabel,
} from '../../src/window/pie-editor/draft.ts';

describe('pie editor draft', () => {
  it('offers exactly the icons the site ships', () => {
    const files = readdirSync(new URL('../../public/scene/icons', import.meta.url))
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.slice(0, -4));
    expect([...EditorIcons].sort()).toEqual(files.sort());
  });

  it('opens every built-in pie on its shipped content, padded to the full ring', () => {
    for (const def of BuiltInPies) {
      const d = defaultDraft(def.shortcutId);
      expect(d.title).toBe(def.title);
      expect(d.items).toHaveLength(8);
      def.items.forEach(([id, icon], i) => expect(d.items[i]).toEqual({ target: id, label: '', icon }));
      for (const item of d.items) if (item.icon) expect(hasIcon(item.icon), item.icon).toBe(true);
    }
  });

  it('starts a custom pie empty and untitled', () => {
    const d = defaultDraft(null);
    expect(d.title).toBe('');
    expect(d.items.every((s) => !s.target)).toBe(true);
  });

  it("names a slot after its action, its menu command's leaf, or its rename", () => {
    expect(naturalName('Blendon/Shading/Unlit')).toBe('Unlit');
    expect(naturalName('Blendon/Pivot Point/Median Point')).toBe('Median');
    expect(naturalName('GameObject/Align With View')).toBe('Align With View');
    expect(slotLabel({ target: 'Blendon/Shading/Unlit', label: 'Flat', icon: '' })).toBe('Flat');
  });

  it('lists every Blendon action and some main-menu commands', () => {
    const paths = actionLeaves().map((l) => l.path);
    for (const a of ActionCatalog.all()) expect(paths).toContain(a.id);
    expect(paths).toContain('Edit/Duplicate');
  });

  it('takes the action icon, or guesses one for a menu command', () => {
    expect(assign('Blendon/Tools/Move')).toEqual({ target: 'Blendon/Tools/Move', label: '', icon: 'd_MoveTool' });
    expect(assign('Edit/Duplicate').icon).toBe('d_TreeEditor.Duplicate');
    expect(guessIcon('GameObject/3D Object/Cube')).toBe('d_PreMatCube');
    for (const path of actionLeaves().map((l) => l.path)) {
      const icon = guessIcon(path);
      if (icon) expect(hasIcon(icon), icon).toBe(true);
    }
  });
});
