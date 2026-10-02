import { describe, expect, it } from 'vitest';
import { drawMethods, parse, splitArgs, stringConcat, stripComments } from '../../scripts/sync/csharp.ts';
import { cond, Ctx, num } from '../../scripts/sync/ops.ts';

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
