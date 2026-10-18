import { describe, expect, it, vi } from 'vitest';
import { captureEditorMenu, EditorEdit } from '../../src/scene/blendon/scenetools/scene-menu/editor-menu.ts';
import { bindingText, Selection, ShortcutManager } from '../../src/scene/unity/editor.ts';
import { IS_MAC } from '../../src/scene/unity/imgui.ts';
import { GameObject, Scene } from '../../src/scene/unity/scene.ts';

// IS_MAC is read once, as imgui.ts loads, so the platform is in place before any import.
vi.hoisted(() => vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' }));

describe('the context menu keys on macOS', () => {
  it('run on Cmd, the key the menu lists beside each entry', () => {
    expect(IS_MAC).toBe(true);
    const scene = new Scene();
    Scene.current = scene;
    const cube = new GameObject(scene, 'Cube');
    Selection.set([cube], cube, false);
    EditorEdit.install();
    const listed = new Map(captureEditorMenu().items.map((i) => [i.label, i.hotkey]));
    const ids: [string, string][] = [
      ['Cut', 'Edit/Cut'],
      ['Copy', 'Edit/Copy'],
      ['Paste', 'Edit/Paste'],
      ['Duplicate', 'Edit/Duplicate'],
      ['Move to View', 'GameObject/Move To View'],
      ['Align with View', 'GameObject/Align With View'],
    ];
    for (const [label, id] of ids) {
      expect(listed.get(label)).toMatch(/^Cmd\+/);
      expect(bindingText(ShortcutManager.getShortcutBinding(id))).toBe(listed.get(label));
    }
  });
});
