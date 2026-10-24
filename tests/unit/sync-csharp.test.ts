import { describe, expect, it } from 'vitest';
import { drawMethods, parse, splitArgs, stringConcat, stripComments } from '../../scripts/sync/csharp.ts';
import type { Model1 } from '../../scripts/sync/dump.ts';
import { cond, Ctx, num } from '../../scripts/sync/ops.ts';
import { addViewBodies, pageConverter, propFacts, type ViewBody } from '../../scripts/sync/window-data.ts';
import type { Tip } from '../../src/plugin/schema.ts';

const SOURCE = `
namespace Demo
{
    // A comment with "quotes" and a { brace
    internal static class ZoomPage
    {
        const string Tip = "Scroll { to zoom";

        public static void Draw(SettingsControls s)
        {
            var m = Zoom.Settings;
            s.SubLabel("Wheel", "d_ViewToolZoom");
            /* block comment ; */
            using (new EditorGUI.DisabledScope(!m.Enabled))
            {
                s.Toggle(m.InvertSetting);
            }
            if (m.Method == ZoomMethod.Dolly) s.Slider(m.SpeedSetting);
            else s.Info(Tip);
        }

        static void Helper() { }
    }
}
`;

describe('C# reader', () => {
  it('strips comments but keeps string contents', () => {
    const out = stripComments('var a = "// not a comment"; // gone\n/* gone */ var b = 1;');
    expect(out).toContain('"// not a comment"');
    expect(out).not.toContain('gone');
  });

  it('finds Draw* methods with their class and parameters', () => {
    const methods = drawMethods(SOURCE);
    expect(methods.map((m) => [m.className, m.name, m.params])).toEqual([['ZoomPage', 'Draw', 'SettingsControls s']]);
    expect(methods[0]?.body).not.toContain('block comment');
  });

  it('parses statements, using blocks and if/else', () => {
    const body = drawMethods(SOURCE)[0]?.body ?? '';
    const stmts = parse(body);
    expect(stmts.map((s) => s[0])).toEqual(['stmt', 'stmt', 'using', 'if']);
    const branch = stmts[3];
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
  const ctx = new Ctx(
    'ZoomSettings',
    { 'ZoomPage.Tip': 'Scroll', 'ZoomSettings.Old': 'Kept' },
    {},
    { view: 'ZoomPage' },
  );

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

  it('names a setting by its declaration on whatever object holds it', () => {
    const c = new Ctx('TransformGizmoSettings', {}, {}, { models: { m: 'TransformGizmoSettings' } });
    expect(c.prop('m.EnabledSetting')).toBe('TransformGizmoSettings.Enabled');
    expect(c.prop('m.Enabled')).toBe('TransformGizmoSettings.Enabled');
    expect(c.modelOf('m.Rotate')).toBe('TransformRotateSettings');
    expect(c.prop('Zoom.Settings.KeyboardStepSetting')).toBe('ZoomSettings.KeyboardStep');
  });

  it('resolves constants against the view, then the owner class', () => {
    expect(ctx.constant('Tip')).toBe('Scroll');
    expect(ctx.constant('Old')).toBe('Kept');
    expect(() => ctx.constant('Missing')).toThrow();
  });
});

// ---- fragments copied from the plugin's page views (settings descriptors, 2026-10), so a change in how a view
// calls SettingsControls shows up here before it breaks `pnpm sync` ----

// Editor/Navigation/Zoom/ZoomPage.cs
const ZOOM = `
    internal static class ZoomPage
    {
        /// <summary>Numpad +/- zoom. Also shown on the Numpad Views page so its table is complete.</summary>
        public static void DrawKeyboard(SettingsControls s)
        {
            var m        = Zoom.Settings;
            var keyboard = s.Toggle(m.KeyboardEnabledSetting);
            using (new EditorGUI.DisabledScope(!keyboard))
            {
                s.ShortcutField("Zoom In", Zoom.ZoomInShortcutId);
                s.ShortcutField("Zoom Out", Zoom.ZoomOutShortcutId);
                s.Slider(m.KeyboardStepSetting);
            }
        }
    }
`;

// Editor/Navigation/NumpadViews/ViewportNavPage.cs, the end of Draw.
const VIEWPORT_NAV = `
    internal static class ViewportNavPage
    {
        public static void Draw(SettingsControls s)
        {
            // These mirror other tools' bindings and follow those tools' switches. A live key stays editable.
            s.SubLabel("Zoom", "d_ViewToolZoom");
            using (new EditorGUI.DisabledScope(!Zoom.Settings.Enabled))
            {
                ZoomPage.DrawKeyboard(s);
            }

            // Edits the owning tools' bindings, no second pair.
            s.SubLabel("Frame Selected", "d_Grid.BoxTool@2x");
            s.MirroredShortcut(SettingsPage.FrameSelected, ShortcutIds.FrameSelectedId);

            s.PageLink(SettingsPage.FrameSelected, "Open");
        }
    }
`;

// Editor/Navigation/Pan/PanPage.cs
const PAN = `
    internal static class PanPage
    {
        public static void Draw(SettingsControls s)
        {
            var m = Pan.Settings;
            s.MasterHeader(SettingsPage.Pan, m.EnabledSetting);

            using (new EditorGUI.DisabledScope(!m.Enabled))
            {
                s.ShortcutField(m.ShortcutSetting);
                var wrapEnabled = s.Toggle(m.CursorWrapEnabledSetting);
                using (new EditorGUI.DisabledScope(!wrapEnabled))
                {
                    var wrap = s.EnumPopup(m.CursorWrapSetting);

                    if (wrap.SupportsBounds()) s.EnumPopup(m.WrapBoundsSetting);
                }
            }
        }
    }
`;

// Editor/Gizmos/Common/SharedGizmoPage.cs
const SHARED_GIZMOS = `
    internal static class SharedGizmoPage
    {
        const string TitleIcon = "d_Transform Icon";
        const string Subtitle  = "Enable all four transform tools at once";

        public static void Draw(SettingsControls s)
        {
            var m = SharedGizmoSettings.Instance;
            GizmoAppearancePresets.DrawHeader(s, m, TitleIcon, "All Tools", Subtitle, m.AllToolsEnabled,
                SetAllTools);

            s.SubLabel("Vertex Snapping", "d_wireframe");

            // Keys go off with the last tool, so with all four off there's nothing to edit.
            using (new EditorGUI.DisabledScope(!m.AnyToolEnabled))
            {
                s.ShortcutField("Hold", VertexSnapping.ShortcutId);
                s.ShortcutField("Pick Virtual Pivot", VertexSnapping.PickShortcutId);
            }
        }

        public static void DrawAxisColors(SettingsControls s)
        {
            var general = GeneralSettings.Instance;

            s.SubLabel("Axis Colors", "d_Grid.PaintTool");
            s.InfoLink("The axis palette is shared ", "plugin-wide", ".", SettingsPage.Overview,
                general.AxisColorXSetting);

            // Stored on General, no per-gizmo palette.
            using (new EditorGUI.DisabledScope(!general.ColorsEditable))
            {
                s.ColorField(general.AxisColorXSetting);
                s.ColorField(general.AxisColorYSetting);
                s.ColorField(general.AxisColorZSetting);
            }

            s.ColorField(general.OutlineColorSetting);
        }
    }
`;

// Editor/Gizmos/Move/MoveGizmoPage.cs, the surface snap rows.
const MOVE = `
    internal static class MoveGizmoPage
    {
        const string SurfaceSnapNoKeyNote = "No key set, so Surface Snap won't engage.";

        const string SurfaceSnapNoKeyInfoText = "The modifier is None.";

        public static void Draw(SettingsControls s)
        {
            var m = MoveGizmo.Instance.Settings;
            GizmoAppearancePresets.DrawHeader(s, "d_MoveTool", "Move", "Enable Move", m.EnabledSetting);

            var enabled = m.Enabled;
            using (new EditorGUI.DisabledScope(!enabled))
            {
                var surfaceSnap = s.Toggle(m.SurfaceSnapEnabledSetting);
                using (new EditorGUI.DisabledScope(!surfaceSnap))
                {
                    var modifier = s.ModifierField(m.SurfaceSnapModifierSetting);

                    if (surfaceSnap && modifier == ModifierKey.None)
                        s.Note(SurfaceSnapNoKeyNote, SurfaceSnapNoKeyInfoText);
                }
            }
        }
    }
`;

// Editor/Gizmos/Composite/TransformGizmoPage.cs, the rotate part's card.
const TRANSFORM = `
    internal static class TransformGizmoPage
    {
        public static void Draw(SettingsControls s)
        {
            var m = TransformGizmo.Instance.Settings;

            s.BeginGroupCard(SettingsPage.RotateGizmo);
            DrawRotate(s, m.Rotate);
            s.EndGroupCard();
        }

        static void DrawRotate(SettingsControls s, TransformRotateSettings m)
        {
            var showTrackball = s.Toggle(m.TrackballEnabledSetting);
            using (new EditorGUI.DisabledScope(!showTrackball))
            {
                s.Slider(m.TrackballRadiusSetting);
            }

            RotateGizmoPage.TrackballRingNote(s, m, showTrackball);
        }
    }
`;

// Editor/App/SettingsWindow/Overview/OverviewDefaults.cs
const GENERAL = `
    internal static class OverviewDefaults
    {
        const string Intro = "Values the rest of Blendon falls back to.";

        /// <summary>The axis palette has no per-tool override, so it lives here.</summary>
        public static void Draw(SettingsControls s)
        {
            var m = GeneralSettings.Instance;

            s.Info(Intro);

            s.SubLabel("Animation", "Motion Icon");
            var animate = s.Toggle(m.AnimationEnabledSetting);
            using (new EditorGUI.DisabledScope(!animate))
            {
                s.Slider(m.AnimationDurationSetting);
            }

            s.SubLabel("Axis Colors", "d_Grid.PaintTool");

            using (new EditorGUI.DisabledScope(!m.ColorsEditable))
            {
                s.ColorField(m.AxisColorXSetting);
            }
        }
    }
`;

const CONSTS: Record<string, string> = {
  'Zoom.ZoomInShortcutId': 'Blendon/Zoom/Zoom In',
  'Zoom.ZoomOutShortcutId': 'Blendon/Zoom/Zoom Out',
  'ShortcutIds.FrameSelectedId': 'Blendon/Frame Selected',
  'VertexSnapping.ShortcutId': 'Blendon/All Tools/Vertex Snap',
  'VertexSnapping.PickShortcutId': 'Blendon/All Tools/Pick Virtual Pivot',
  'SharedGizmoPage.TitleIcon': 'd_Transform Icon',
  'SharedGizmoPage.Subtitle': 'Enable all four transform tools at once',
  'MoveGizmoPage.SurfaceSnapNoKeyNote': "No key set, so Surface Snap won't engage.",
  'MoveGizmoPage.SurfaceSnapNoKeyInfoText': 'The modifier is None.',
  'OverviewDefaults.Intro': 'Values the rest of Blendon falls back to.',
};

// Cards as the dump carries them: `src` as written, `t` resolved for the Blendon preset.
const TIPS: Record<string, Tip> = {
  'Blendon/Zoom/Zoom In': {
    t: 'Zoom in: <b>Num +</b>',
    i: 'Tips/Zoom/Keys.png',
    src: 'Zoom in: {key:Blendon/Zoom/Zoom In}',
  },
  'Blendon/Zoom/Zoom Out': { t: 'Zoom out', i: '' },
  'Blendon/All Tools/Vertex Snap': {
    t: 'Snap',
    i: 'Tips/AllTools/VertexSnapping.png',
    src: 'Hold {key:Blendon/All Tools/Vertex Snap}',
  },
  'Blendon/All Tools/Pick Virtual Pivot': { t: 'Pick', i: 'Tips/AllTools/PickVirtualPivot.png' },
};

// What the dump adds to a setting: bounds, a key row's shortcut, the value an Override row follows.
type Fact = { min?: number; max?: number; shortcut?: string; follows?: string };
function dumpOf(props: Record<string, Fact>): Model1 {
  const pages = new Map<string, Model1['pages'][number]>();
  for (const [key, fact] of Object.entries(props)) {
    const [type = '', name = ''] = key.split('.');
    const page = pages.get(type) ?? { type, switchTip: { text: '', image: '', source: '' }, props: [] };
    page.props.push({
      name,
      ptype: '',
      label: '',
      tip: { text: '', image: '', source: '' },
      value: 0,
      default: 0,
      ...fact,
    });
    pages.set(type, page);
  }
  return { pages: [...pages.values()] };
}

const FACTS = propFacts(
  dumpOf({
    'ZoomSettings.KeyboardStep': { min: 0.01, max: 0.9 },
    'GeneralSettings.AnimationDuration': { min: 0.0001, max: 2 },
    'RotateGizmoSettings.TrackballRadius': { min: 0.01, max: 2 },
    'FrameSelectedSettings.Shortcut': { shortcut: 'Blendon/Frame Selected' },
    'PanSettings.Shortcut': { shortcut: 'Blendon/Pan' },
    'PanSettings.CursorWrapEnabled': { follows: 'GeneralSettings.CursorWrapEnabled' },
    'PanSettings.CursorWrap': { follows: 'GeneralSettings.CursorWrap' },
    'PanSettings.WrapBounds': { follows: 'GeneralSettings.WrapBounds' },
    'MoveGizmoSettings.SurfaceSnapModifier': { follows: 'SharedGizmoSettings.AimModifier' },
  }),
);

function bodiesOf(...sources: [string, string][]): Map<string, ViewBody> {
  const bodies = new Map<string, ViewBody>();
  for (const [owner, src] of sources) addViewBodies(bodies, src, owner);
  return bodies;
}

describe('ops from the plugin pages', () => {
  const run = pageConverter(
    bodiesOf(
      ['ZoomSettings', ZOOM],
      ['ViewportNavSettings', VIEWPORT_NAV],
      ['PanSettings', PAN],
      ['SharedGizmoSettings', SHARED_GIZMOS],
      ['MoveGizmoSettings', MOVE],
      ['TransformGizmoSettings', TRANSFORM],
      ['GeneralSettings', GENERAL],
    ),
    CONSTS,
    TIPS,
    FACTS,
  );

  const zoomKeys = [
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
  ];

  it('reads a two-argument ShortcutField with the card as written, a slider with its declared bounds', () => {
    expect(run('ZoomPage', 'DrawKeyboard')).toEqual(zoomKeys);
  });

  it("follows a call into another view's Draw method, and a mirrored shortcut to its owner's key row", () => {
    expect(run('ViewportNavPage', 'Draw')).toEqual([
      ['sub', 'Zoom', 'd_ViewToolZoom', 15, 0],
      ['dis', ['!', ['v', 'ZoomSettings.Enabled']], zoomKeys],
      ['sub', 'Frame Selected', 'd_Grid.BoxTool@2x', 15, 0],
      [
        'dis',
        ['!', ['f', 'pageEnabled', 'FrameSelected']],
        [['sc', 'Blendon/Frame Selected', 'FrameSelectedSettings.Shortcut']],
      ],
      ['plink', 'FrameSelected', 'Open'],
    ]);
  });

  it('draws a key row from its declaration and rows with an Override box from what they follow', () => {
    expect(run('PanPage', 'Draw')).toEqual([
      ['master', 'page', 'Pan', 'PanSettings.Enabled'],
      [
        'dis',
        ['!', ['v', 'PanSettings.Enabled']],
        [
          ['sc', 'Blendon/Pan', 'PanSettings.Shortcut'],
          ['gtog', 'PanSettings.CursorWrapEnabled', 'GeneralSettings.CursorWrapEnabled'],
          [
            'dis',
            ['!', ['v', 'PanSettings.CursorWrapEnabled']],
            [
              ['gpop', 'PanSettings.CursorWrap', 'GeneralSettings.CursorWrap'],
              [
                'if',
                ['f', 'supportsBounds', ['v', 'PanSettings.CursorWrap']],
                [['gpop', 'PanSettings.WrapBounds', 'GeneralSettings.WrapBounds']],
                null,
              ],
            ],
          ],
        ],
      ],
    ]);
  });

  it('reads the gizmo header in both forms, and a modifier that follows another page as linked', () => {
    expect(run('SharedGizmoPage', 'Draw')[0]).toEqual([
      'master',
      'gizmo',
      'd_Transform Icon',
      'All Tools',
      'SharedGizmoSettings.AllToolsEnabled',
    ]);
    expect(run('MoveGizmoPage', 'Draw')).toEqual([
      ['master', 'gizmo', 'd_MoveTool', 'Move', 'MoveGizmoSettings.Enabled'],
      [
        'dis',
        ['!', ['v', 'MoveGizmoSettings.Enabled']],
        [
          ['tog', 'MoveGizmoSettings.SurfaceSnapEnabled'],
          [
            'dis',
            ['!', ['v', 'MoveGizmoSettings.SurfaceSnapEnabled']],
            [
              ['imod', 'MoveGizmoSettings.SurfaceSnapModifier', 'SharedGizmoSettings.AimModifier', 'SharedGizmos'],
              [
                'if',
                [
                  '&&',
                  ['v', 'MoveGizmoSettings.SurfaceSnapEnabled'],
                  ['==', ['v', 'MoveGizmoSettings.SurfaceSnapModifier'], ['c', 'None']],
                ],
                [['note', "No key set, so Surface Snap won't engage.", 'The modifier is None.']],
                null,
              ],
            ],
          ],
        ],
      ],
    ]);
  });

  it('hands a Transform part to a method declared for it, its bounds falling back to the standalone tool', () => {
    const ops = run('TransformGizmoPage', 'Draw');
    expect(ops[0]).toEqual(['card', 'RotateGizmo']);
    expect(ops[1]).toEqual(['tog', 'TransformRotateSettings.TrackballEnabled']);
    expect(ops[2]).toEqual([
      'dis',
      ['!', ['v', 'TransformRotateSettings.TrackballEnabled']],
      [['sld', 'TransformRotateSettings.TrackballRadius', 0.01, 2]],
    ]);
    expect(JSON.stringify(ops[3])).toContain('TransformRotateSettings.ScreenRingRadius');
    expect(ops[4]).toEqual(['endcard']);
  });

  it('locks the axis colours with the master switch', () => {
    expect(run('SharedGizmoPage', 'DrawAxisColors')).toEqual([
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
  });

  it('gates the vertex snapping keys on any tool', () => {
    const ops = run('SharedGizmoPage', 'Draw');
    expect(ops[2]).toEqual([
      'dis',
      ['!', ['f', 'anyTool']],
      [
        [
          'sc',
          'Blendon/All Tools/Vertex Snap',
          null,
          'Hold',
          'Hold {key:Blendon/All Tools/Vertex Snap}',
          'Tips/AllTools/VertexSnapping.png',
        ],
        [
          'sc',
          'Blendon/All Tools/Pick Virtual Pivot',
          null,
          'Pick Virtual Pivot',
          'Pick',
          'Tips/AllTools/PickVirtualPivot.png',
        ],
      ],
    ]);
  });

  it("reads the Overview's Defaults card", () => {
    expect(run('OverviewDefaults', 'Draw')).toEqual([
      ['info', 'Values the rest of Blendon falls back to.'],
      ['sub', 'Animation', 'Motion Icon', 15, 0],
      ['tog', 'GeneralSettings.AnimationEnabled'],
      [
        'dis',
        ['!', ['v', 'GeneralSettings.AnimationEnabled']],
        [['sld', 'GeneralSettings.AnimationDuration', 0.0001, 2]],
      ],
      ['sub', 'Axis Colors', 'd_Grid.PaintTool', 15, 0],
      ['dis', ['!', ['v', 'GeneralSettings.Enabled']], [['col', 'GeneralSettings.AxisColorX']]],
    ]);
  });

  it('names what it cannot read', () => {
    const bare = pageConverter(bodiesOf(['ZoomSettings', ZOOM]), CONSTS, {}, FACTS);
    expect(() => bare('ZoomPage', 'DrawKeyboard')).toThrow('No card for shortcut Blendon/Zoom/Zoom In');
    const noConst = pageConverter(bodiesOf(['ZoomSettings', ZOOM]), {}, TIPS, FACTS);
    expect(() => noConst('ZoomPage', 'DrawKeyboard')).toThrow('Unknown constant Zoom.ZoomInShortcutId');
    const noDump = pageConverter(bodiesOf(['ZoomSettings', ZOOM]), CONSTS, TIPS);
    expect(() => noDump('ZoomPage', 'DrawKeyboard')).toThrow('No range for slider ZoomSettings.KeyboardStep');
  });
});
