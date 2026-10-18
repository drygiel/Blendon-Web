import { describe, expect, it } from 'vitest';
import { drawMethods, parse, splitArgs, stringConcat, stripComments, type Stmt } from '../../scripts/sync/csharp.ts';
import { cond, Ctx, num } from '../../scripts/sync/ops.ts';
import { pageConverter } from '../../scripts/sync/window-data.ts';
import type { Tip } from '../../src/plugin/schema.ts';

const SOURCE = `
namespace Demo
{
    // A comment with "quotes" and a { brace
    public sealed class ZoomSettings : SettingsBase
    {
        const string Tip = "Scroll { to zoom";

        public override void DrawSettings(SettingsControls s)
        {
            s.SubLabel("Wheel", "d_ViewToolZoom");
            /* block comment ; */
            using (new EditorGUI.DisabledScope(!Enabled))
            {
                s.Toggle(() => Invert, v => Invert = v);
            }
            if (Method == ZoomMethod.Dolly) s.Slider(() => Speed, v => Speed = v, 0.1f, 2f);
            else s.Info(Tip);
        }

        void Helper() { }
    }
}
`;

describe('C# reader', () => {
  it('strips comments but keeps string contents', () => {
    const out = stripComments('var a = "// not a comment"; // gone\n/* gone */ var b = 1;');
    expect(out).toContain('"// not a comment"');
    expect(out).not.toContain('gone');
  });

  it('finds Draw* methods with their class', () => {
    const methods = drawMethods(SOURCE);
    expect(methods.map((m) => [m.className, m.name])).toEqual([['ZoomSettings', 'DrawSettings']]);
    expect(methods[0]?.body).not.toContain('block comment');
  });

  it('parses statements, using blocks and if/else', () => {
    const body = drawMethods(SOURCE)[0]?.body ?? '';
    const stmts = parse(body);
    expect(stmts.map((s) => s[0])).toEqual(['stmt', 'using', 'if']);
    const branch = stmts[2];
    expect(branch?.[0] === 'if' && branch[3]).toEqual(['stmt', 's.Info(Tip)']);
  });

  it('splits arguments at top-level commas only', () => {
    expect(splitArgs('() => A, v => A = v, Max(1, 2), "a, b"')).toEqual([
      '() => A',
      'v => A = v',
      'Max(1, 2)',
      '"a, b"',
    ]);
  });

  it('evaluates literal concatenations with escapes', () => {
    expect(stringConcat('"a\\n" + "b \\"c\\""')).toBe('a\nb "c"');
    expect(stringConcat('"a" + Name')).toBeNull();
  });
});

describe('ops', () => {
  const ctx = new Ctx('ZoomSettings', { 'ZoomSettings.Tip': 'Scroll' });

  it('reads C# float literals', () => {
    expect(num('0.1f')).toBe(0.1);
    expect(num('.5f')).toBe(0.5);
    expect(num('MaxQuality')).toBe(6);
  });

  it('turns conditions into expression trees', () => {
    expect(cond(ctx, 'new EditorGUI.DisabledScope(!Enabled)')).toEqual(['!', ['v', 'ZoomSettings.Enabled']]);
    expect(cond(ctx, 'General.CursorWrapEnabled && Modifier == ModifierKey.None')).toEqual([
      '&&',
      ['v', 'GeneralSettings.CursorWrapEnabled'],
      ['==', ['v', 'ZoomSettings.Modifier'], ['c', 'None']],
    ]);
  });

  it('resolves constants against the owner class', () => {
    expect(ctx.constant('Tip')).toBe('Scroll');
    expect(() => ctx.constant('Missing')).toThrow();
  });
});

// ---- fragments copied from the plugin's settings pages (remediation/2026-10), so a change in how a page
// calls SettingsControls shows up here before it breaks `pnpm sync` ----

// Editor/Navigation/Zoom/ZoomSettings.cs
const ZOOM = `
    public sealed class ZoomSettings : SettingsBase
    {
        /// <summary>Numpad +/- zoom. Also shown on the Numpad Views page so its table is complete.</summary>
        public void DrawKeyboardSettings(SettingsControls s)
        {
            var keyboard = s.Toggle(() => KeyboardEnabled, v => KeyboardEnabled = v);
            using (new EditorGUI.DisabledScope(!keyboard))
            {
                s.ShortcutField("Zoom In", Zoom.ZoomInShortcutId);
                s.ShortcutField("Zoom Out", Zoom.ZoomOutShortcutId);
                s.Slider(() => KeyboardStep, v => KeyboardStep = v, 0.01f, 0.9f);
            }
        }
    }
`;

// Editor/Navigation/NumpadViews/ViewportNavSettings.cs, the end of DrawSettings.
const VIEWPORT_NAV = `
    public sealed class ViewportNavSettings : SettingsBase
    {
        public override void DrawSettings(SettingsControls s)
        {
            // Edits the owning tools' bindings, no second pair.
            s.SubLabel("Frame Selected", "d_Grid.BoxTool@2x");
            s.MirroredShortcut(SettingsPage.FrameSelected, Blendon.Editor.Shortcuts.ShortcutIds.FrameSelectedId);

            s.PageLink(SettingsPage.FrameSelected, "Open");
        }
    }
`;

// Editor/SceneTools/FrameSelected/FrameSelectedSettings.cs
const FRAME_SELECTED = `
    public sealed class FrameSelectedSettings : SettingsBase
    {
        /// <summary>Also mirrored on the Numpad Views page so its table shows the real Numpad . binding.</summary>
        protected internal override bool DrawMirroredShortcut(SettingsControls s, string shortcutId)
        {
            if (shortcutId != FrameSelected.ShortcutId) return false;

            DrawShortcut(s);
            return true;
        }

        void DrawShortcut(SettingsControls s)
        {
            s.ShortcutField(() => Shortcut, v => Shortcut = v, FrameSelected.ShortcutId);
        }
    }
`;

// Editor/Gizmos/Common/SharedGizmoSettings.cs
const SHARED_GIZMOS = `
    public sealed class SharedGizmoSettings : SettingsBase
    {
        public override void DrawSettings(SettingsControls s)
        {
            s.SubLabel("Vertex Snapping", "d_wireframe");

            // Keys go off with the last tool, so with all four off there's nothing to edit.
            using (new EditorGUI.DisabledScope(!AnyToolEnabled))
            {
                s.ShortcutField("Hold", VertexSnapping.ShortcutId);
                s.ShortcutField("Pick Virtual Pivot", VertexSnapping.PickShortcutId);
            }
        }

        public static void DrawAxisColorsGroup(SettingsControls s)
        {
            s.SubLabel("Axis Colors", "d_Grid.PaintTool");
            s.InfoLink("The axis palette is shared ", "plugin-wide", ".", SettingsPage.Overview,
                () => General.AxisColorX);

            // Stored on General, no per-gizmo palette. Locked while parked on Unity's colors, an edit would be
            // overwritten when the tools come back.
            using (new EditorGUI.DisabledScope(!General.ColorsEditable))
            {
                s.ColorField(() => General.AxisColorX, v => General.AxisColorX = v);
                s.ColorField(() => General.AxisColorY, v => General.AxisColorY = v);
                s.ColorField(() => General.AxisColorZ, v => General.AxisColorZ = v);
            }

            s.ColorField(() => General.OutlineColor, v => General.OutlineColor = v);
        }
    }
`;

const CONSTS: Record<string, string> = {
  'Zoom.ZoomInShortcutId': 'Blendon/Zoom/Zoom In',
  'Zoom.ZoomOutShortcutId': 'Blendon/Zoom/Zoom Out',
  'FrameSelected.ShortcutId': 'Blendon/Frame Selected',
  'VertexSnapping.ShortcutId': 'Blendon/Vertex Snap',
  'VertexSnapping.PickShortcutId': 'Blendon/Pick Virtual Pivot',
};

// Cards as the dump carries them: `src` as written, `t` resolved for the Blendon preset.
const TIPS: Record<string, Tip> = {
  'Blendon/Zoom/Zoom In': {
    t: 'Zoom in: <b>Num +</b>',
    i: 'Tips/Zoom/Keys.png',
    src: 'Zoom in: {key:Blendon/Zoom/Zoom In}',
  },
  'Blendon/Zoom/Zoom Out': { t: 'Zoom out', i: '' },
  'Blendon/Vertex Snap': { t: 'Snap', i: 'Tips/AllTools/VertexSnapping.png', src: 'Hold {key:Blendon/Vertex Snap}' },
  'Blendon/Pick Virtual Pivot': { t: 'Pick', i: 'Tips/AllTools/PickVirtualPivot.png' },
};

function bodiesOf(...sources: string[]): Map<string, Stmt[]> {
  const bodies = new Map<string, Stmt[]>();
  for (const src of sources) for (const m of drawMethods(src)) bodies.set(m.className + '#' + m.name, parse(m.body));
  return bodies;
}

describe('ops from the plugin pages', () => {
  const run = pageConverter(bodiesOf(ZOOM, VIEWPORT_NAV, FRAME_SELECTED, SHARED_GIZMOS), CONSTS, TIPS);

  it('reads a two-argument ShortcutField with the card as written', () => {
    expect(run('ZoomSettings', 'DrawKeyboardSettings')).toEqual([
      ['tog', 'ZoomSettings.KeyboardEnabled'],
      [
        'dis',
        ['!', ['v', 'ZoomSettings.KeyboardEnabled']],
        [
          ['sc', 'Blendon/Zoom/Zoom In', null, 'Zoom In', 'Zoom in: {key:Blendon/Zoom/Zoom In}', 'Tips/Zoom/Keys.png'],
          ['sc', 'Blendon/Zoom/Zoom Out', null, 'Zoom Out', 'Zoom out', ''],
          ['sld', 'ZoomSettings.KeyboardStep', 0.01, 0.9],
        ],
      ],
    ]);
  });

  it('draws a mirrored shortcut with its owner row, grayed with the owner page', () => {
    expect(run('ViewportNavSettings', 'DrawSettings')).toEqual([
      ['sub', 'Frame Selected', 'd_Grid.BoxTool@2x', 15, 0],
      [
        'dis',
        ['!', ['f', 'pageEnabled', 'FrameSelected']],
        [['sc', 'Blendon/Frame Selected', 'FrameSelectedSettings.Shortcut']],
      ],
      ['plink', 'FrameSelected', 'Open'],
    ]);
  });

  it('locks the axis colours with the master switch', () => {
    expect(run('SharedGizmoSettings', 'DrawAxisColorsGroup')).toEqual([
      ['sub', 'Axis Colors', 'd_Grid.PaintTool', 15, 0],
      ['ilink', 'The axis palette is shared ', 'plugin-wide', '.', 'Overview'],
      [
        'dis',
        ['!', ['v', 'GeneralSettings.Enabled']],
        [
          ['col', 'GeneralSettings.AxisColorX'],
          ['col', 'GeneralSettings.AxisColorY'],
          ['col', 'GeneralSettings.AxisColorZ'],
        ],
      ],
      ['col', 'GeneralSettings.OutlineColor'],
    ]);
    expect(cond(new Ctx('SharedGizmoSettings', {}), 'new EditorGUI.DisabledScope(!General.ColorsEditable)')).toEqual([
      '!',
      ['v', 'GeneralSettings.Enabled'],
    ]);
  });

  it('gates the vertex snapping keys on any tool', () => {
    const ops = run('SharedGizmoSettings', 'DrawSettings');
    expect(ops[1]).toEqual([
      'dis',
      ['!', ['f', 'anyTool']],
      [
        [
          'sc',
          'Blendon/Vertex Snap',
          null,
          'Hold',
          'Hold {key:Blendon/Vertex Snap}',
          'Tips/AllTools/VertexSnapping.png',
        ],
        ['sc', 'Blendon/Pick Virtual Pivot', null, 'Pick Virtual Pivot', 'Pick', 'Tips/AllTools/PickVirtualPivot.png'],
      ],
    ]);
  });

  it('names what it cannot read', () => {
    const bare = pageConverter(bodiesOf(ZOOM), CONSTS, {});
    expect(() => bare('ZoomSettings', 'DrawKeyboardSettings')).toThrow('No card for shortcut Blendon/Zoom/Zoom In');
    const noConst = pageConverter(bodiesOf(ZOOM), {}, TIPS);
    expect(() => noConst('ZoomSettings', 'DrawKeyboardSettings')).toThrow('Unknown constant Zoom.ZoomInShortcutId');
  });
});
