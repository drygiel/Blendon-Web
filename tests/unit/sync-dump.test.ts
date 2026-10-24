import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitStaged, stageAssets } from '../../scripts/sync/assets.ts';
import { checkShape, loadDump, Problems, toTip } from '../../scripts/sync/dump.ts';
import { checkTokens } from '../../scripts/sync/window-data.ts';

// A dump of one page, one shortcut and one contested key, shaped like schema 2 (Web-Update-Plan section 5).
const card = (text: string, source = text, image = '') => ({ text, image, source });
const grab = card('Grab: <b><color=#D98E38>G</color></b>', 'Grab: {key:Blendon/Move/Grab}', 'Tips/Move/Grab.png');
const FIXTURE = {
  meta: {
    schema: 2,
    unity: '6000.4.11f1',
    exportedAt: '2026-10-17T12:00:00Z',
    counts: { pages: 1, props: 1, ids: 2, known: 1 },
  },
  model: {
    pages: [
      {
        type: 'MoveGizmoSettings',
        switchTip: card('Move'),
        header: {
          image: 'Tips/Move/Header.png',
          video: 'Tips/Move/Header.webm',
          footer: '',
          sections: [['HOW', 'Drag an arrow']],
          keys: [{ action: 'grab', active: true, bindings: [{ blendon: 'G', unity: 'Shift+G' }] }],
        },
        props: [
          {
            name: 'Enabled',
            ptype: 'Boolean',
            label: 'Enable Move',
            icon: '',
            tip: card('On'),
            value: true,
            default: true,
          },
        ],
      },
    ],
  },
  model2: {
    consts: { 'OverviewTips.KeyNote': '' },
    pageShortcuts: {
      MoveGizmo: {
        enabled: true,
        full: true,
        primary: 'Blendon/Move/Grab',
        ids: [
          { id: 'Blendon/Move/Grab', name: 'Grab', keys: { blendon: 'G', unity: 'Shift+G' }, text: 'G', tip: grab },
        ],
      },
    },
    keymap: {
      'Blendon/Move/Grab': { blendon: 'G', unity: 'Shift+G' },
      'Tools/Cycle Tool Modes': { blendon: 'G', unity: 'G' },
    },
    contextNeed: { 'Blendon/Move/Grab': 'Always' },
    contextOnly: { 'Blendon/Pan': 'PanSettings.ContextOnly' },
    known: [
      {
        row: {
          UnityId: 'Tools/Cycle Tool Modes',
          UnityLabel: 'Cycle Tool Modes',
          BlendonId: 'Blendon/Move/Grab',
          BlendonLabel: 'Grab',
          Key: 'G',
          Replaces: false,
        },
        editorKey: 'G',
        blendonAlt: 'Shift+G',
        editorAlt: 'Shift+G',
        cards: { Covered: card('c'), Replaced: card('r'), Moved: card('m'), Free: card('f') },
      },
    ],
    resolutions: [
      {
        UnityId: 'Tools/Cycle Tool Modes',
        UnityLabel: 'Cycle Tool Modes',
        BlendonId: 'Blendon/Move/Grab',
        BlendonLabel: 'Grab',
        Key: 'G',
        Replaces: false,
        known: true,
      },
    ],
    featureTips: { Move: card('Move'), Keyboard: null },
    linkTips: { 'link:SupportInfo': card('Support') },
  },
  model3: {
    pies: [],
    extras: [],
    frameSteps: [['SelectionCenter', true]],
    modifierLabels: ['None', 'Shift', 'Ctrl', 'Alt'],
    modifierOptions: ['None', 'Shift', 'Action', 'Alt'],
    enums: { ModifierKey: [['None', 'None']] },
    layers: ['0:Default'],
  },
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'blendon-sync-'));
  temps.push(d);
  return d;
};
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeDump(dir: string, files: typeof FIXTURE) {
  for (const [name, v] of Object.entries(files)) writeFileSync(join(dir, name + '.json'), JSON.stringify(v));
  mkdirSync(join(dir, 'ui'));
  writeFileSync(join(dir, 'ui', 'ui.json'), '{"icons":{}}');
}

describe('dump contract', () => {
  it('accepts a schema 2 dump', () => {
    const out = new Problems();
    for (const name of ['meta', 'model', 'model2', 'model3'] as const) checkShape(name, FIXTURE[name], out);
    expect(out.lines()).toEqual([]);
  });

  it('lists what an older dump lacks, once per field', () => {
    const old = clone(FIXTURE.model2) as Record<string, unknown>;
    delete old.keymap;
    const ids = (old.pageShortcuts as typeof FIXTURE.model2.pageShortcuts).MoveGizmo.ids;
    ids.push(clone(ids[0]));
    for (const s of ids) delete (s.tip as Partial<typeof grab>).source;
    const out = new Problems();
    checkShape('model2', old, out);
    expect(out.lines()).toEqual([
      'model2.json.pageShortcuts.*.ids[].tip.source: missing (2x, first at model2.json.pageShortcuts.MoveGizmo.ids[0].tip.source)',
      'model2.json.keymap: missing (at model2.json.keymap)',
    ]);
  });

  it('loads a dump folder and refuses another schema', () => {
    const dir = temp();
    writeDump(dir, FIXTURE);
    const out = new Problems();
    const loaded = loadDump(dir, out);
    expect(out.lines()).toEqual([]);
    expect(loaded.dump?.m2.known[0]?.blendonAlt).toBe('Shift+G');
    expect(loaded.shortcutTips['Blendon/Move/Grab']).toEqual({
      t: grab.text,
      i: grab.image,
      src: grab.source,
    });

    const older = temp();
    writeDump(older, { ...FIXTURE, meta: { ...FIXTURE.meta, schema: 1 } });
    const out2 = new Problems();
    const refused = loadDump(older, out2);
    expect(refused.dump).toBeNull();
    expect(out2.lines()).toEqual(['meta.json: schema 1, this sync reads schema 2']);
    expect(refused.consts['OverviewTips.KeyNote']).toBe('');
  });

  it('keeps a source only where it differs from the text', () => {
    expect(toTip(card('Plain'))).toEqual({ t: 'Plain', i: '' });
    expect(toTip(grab)).toEqual({ t: grab.text, i: grab.image, src: grab.source });
  });

  it('flags tokens the site could not resolve', () => {
    const out = new Problems();
    const props = { 'SharedGizmoSettings.AimModifier': { l: '', t: '', i: '', d: 'Alt', k: 'ModifierKey' } };
    const data = {
      keymap: { 'Blendon/Move/Grab': { b: 'G', u: 'Shift+G' } },
      props: {
        ...props,
        'A.B': {
          l: '',
          t: 'x',
          i: '',
          src: '{key:Blendon/Move/Grab} {key:Tools/Gone} {setting:A.Gone}',
          d: true,
          k: 'Boolean',
        },
      },
    };
    checkTokens(data, data, out);
    // Texts outside the window data, the tutorial's hints, answer to the same keymap.
    checkTokens({ hint: 'Press {key:Main Menu/Edit/Duplicate}' }, data, out);
    expect(out.lines()).toEqual([
      'A text names {key:Tools/Gone}, which model2.json keymap lacks',
      'A text names {setting:A.Gone}, which is no setting',
      'A text names {key:Main Menu/Edit/Duplicate}, which model2.json keymap lacks',
    ]);
  });
});

describe('sync writes', () => {
  it('builds nothing while a source is missing', async () => {
    const root = temp();
    await expect(
      stageAssets([{ kind: 'copy', src: join(root, 'gone.png'), out: 'plugin/gone.png' }], join(root, 'stage'), [
        'plugin',
      ]),
    ).rejects.toThrow('Missing source files');
    expect(existsSync(join(root, 'stage'))).toBe(false);
  });

  it('swaps every staged path in at once', () => {
    const root = temp();
    mkdirSync(join(root, 'public', 'plugin'), { recursive: true });
    writeFileSync(join(root, 'public', 'plugin', 'old.txt'), 'old');
    writeFileSync(join(root, 'data.json'), 'old');
    const stage = join(root, 'stage');
    mkdirSync(join(stage, 'public', 'plugin'), { recursive: true });
    writeFileSync(join(stage, 'public', 'plugin', 'new.txt'), 'new');
    writeFileSync(join(stage, 'data.json'), 'new');
    commitStaged(stage, root, ['public/plugin', 'data.json']);
    expect(readdirSync(join(root, 'public', 'plugin'))).toEqual(['new.txt']);
    expect(readFileSync(join(root, 'data.json'), 'utf8')).toBe('new');
    expect(existsSync(join(stage, '.old'))).toBe(false);
  });

  it('puts everything back when a path cannot be swapped', () => {
    const root = temp();
    mkdirSync(join(root, 'public', 'plugin'), { recursive: true });
    writeFileSync(join(root, 'public', 'plugin', 'old.txt'), 'old');
    const stage = join(root, 'stage');
    mkdirSync(join(stage, 'public', 'plugin'), { recursive: true });
    writeFileSync(join(stage, 'public', 'plugin', 'new.txt'), 'new');
    expect(() => commitStaged(stage, root, ['public/plugin', 'public/docs'])).toThrow('Nothing staged for public/docs');
    expect(readdirSync(join(root, 'public', 'plugin'))).toEqual(['old.txt']);
    expect(existsSync(join(root, 'public', 'docs'))).toBe(false);
  });
});
