// The pie menu editor (PieMenuEditorWindow) for the browser: a modal utility window over the whole
// Playground, dragged by its title bar. Every edit lives on a draft; the demo never saves it.
import './pie-editor.scss';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { iconUrl } from '../../scene/unity/icons.ts';
import { iconStyle } from '../core/icons.ts';
import { pageInfo, type WindowModel } from '../core/model.ts';
import { NEW_PIE } from '../core/state.ts';
import { bindingFromEvent, capTokens } from '../core/text.ts';
import { accented } from '../core/util.ts';
import { D } from '../../plugin/window-data.ts';
import { Caps } from '../ui/common.tsx';
import {
  assign,
  cloneSlot,
  defaultDraft,
  emptySlot,
  naturalName,
  slotLabel,
  type PieDraft,
  type SlotDraft,
} from './draft.ts';
import { ActionPicker, IconPicker, Rename, SlotMenu, type SlotMenuEntry, type SlotMenuPick } from './Pickers.tsx';
import { PiePreview, type SlotPart } from './PiePreview.tsx';

const WindowWidth = 560;
const WindowHeight = 520;
/** Kept clear round the window, so it reads as a dialog over the editor rather than a takeover. */
const Margin = 8;
/** Window margin, card padding and border, and the body's scrollbar: what the ring is fitted inside. */
const RingInset = 2 * 8 + 2 * 10 + 2 + 14;

const TitleCaption = 'Shown above the menu when it opens';
const ShortcutCaptionEnabled = 'Hold, then release on a direction to run it';
const ShortcutCaptionDisabled = 'Switched off - its shortcut is released';
const PreviewCaption =
  'Click a slot to set what it runs, click its icon to change that - right click to rename, copy or paste';

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph'];

/** Outlives the window, as the plugin's static clipboard does, so a copy reaches another menu. */
let clipboard: SlotDraft | null = null;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type PopKind = 'action' | 'icon' | 'rename' | 'menu';

interface Pop {
  kind: PopKind;
  slot: number;
  box: Box;
}

interface Notice {
  title: string;
  body: string;
  ok: string;
  run?: () => void;
  cancel?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Below the anchor where it fits, above it otherwise, and always inside the Playground. */
function place(anchor: Box, w: number, h: number, size: { w: number; h: number }): Box {
  w = Math.min(w, size.w - Margin * 2);
  h = Math.min(h, size.h - Margin * 2);
  const below = anchor.y + anchor.h + 2;
  const y = below + h <= size.h - Margin ? below : anchor.y - h - 2;
  return {
    x: clamp(anchor.x, Margin, size.w - w - Margin),
    y: clamp(y, Margin, size.h - h - Margin),
    w,
    h,
  };
}

const PopSize: Record<PopKind, { w: number; h: number }> = {
  action: { w: 340, h: 420 },
  icon: { w: 10 * 32 + 2 + 14, h: 380 },
  rename: { w: 268, h: 78 },
  menu: { w: 170, h: 6 * 22 + 2 * 9 + 8 },
};

export function PieEditor({ app, iconVars }: { app: WindowModel; iconVars: CSSProperties }) {
  const id = app.st.pieEdit ?? NEW_PIE;
  const pie = D.pies.find((p) => p.id === id) ?? null;
  const sid = pie?.sid ?? null;
  const isNew = !pie;
  const container = app.inst.host?.closest<HTMLElement>('[data-playground]') ?? app.inst.host;

  const layerRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PieDraft>(() => defaultDraft(sid));
  const defaultBinding = sid ? app.shortcutDefault(sid) : '';
  const [binding, setBinding] = useState(() => (sid ? app.shortcut(sid) : ''));
  const [capturing, setCapturing] = useState(false);
  const [pop, setPop] = useState<Pop | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const close = () => app.update({ pieEdit: null });

  useLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [container]);

  // Focus goes to the window as it opens and back to it as each pop-up closes, rather than to nowhere.
  const shown = size.w > 0;
  useEffect(() => {
    if (shown && !pop) winRef.current?.focus({ preventScroll: true });
  }, [shown, pop]);

  const W = Math.min(WindowWidth, size.w - Margin * 2);
  const H = Math.min(WindowHeight, size.h - Margin * 2);
  const at = pos ?? { x: (size.w - W) / 2, y: (size.h - H) / 2 };
  const x = Math.round(clamp(at.x, 0, size.w - W));
  const y = Math.round(clamp(at.y, 0, size.h - H));

  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, x, y };
    const move = (ev: PointerEvent) =>
      setPos({
        x: clamp(start.x + ev.clientX - start.px, 0, size.w - W),
        y: clamp(start.y + ev.clientY - start.py, 0, size.h - H),
      });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // ---- slots ----

  const setSlot = (i: number, f: (s: SlotDraft) => SlotDraft) =>
    setDraft((d) => ({ ...d, items: d.items.map((s, j) => (j === i ? f(s) : s)) }));

  const anchorOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    const l = layerRef.current!.getBoundingClientRect();
    return { x: r.left - l.left, y: r.top - l.top, w: r.width, h: r.height };
  };

  const open = (kind: PopKind, slot: number, anchor: Box) => {
    setCapturing(false);
    setPop({ kind, slot, box: place(anchor, PopSize[kind].w, PopSize[kind].h, size) });
  };

  // Entries reopen their pop-up over the slot's pill, as the plugin's deferred pickers do.
  const pillOf = (slot: number) => {
    const el = layerRef.current?.querySelectorAll('.pe-slot')[slot];
    return el ? anchorOf(el) : (pop?.box ?? { x: 0, y: 0, w: 0, h: 0 });
  };

  const slotMenu = (slot: number): SlotMenuEntry[] => {
    const has = !!draft.items[slot].target;
    return [
      { label: 'Change Action…', value: 'action' },
      { label: 'Set Icon…', enabled: has, value: 'icon' },
      { label: 'Rename…', enabled: has, value: 'rename' },
      {},
      { label: 'Copy', enabled: has, value: 'copy' },
      { label: 'Paste', enabled: !!clipboard, value: 'paste' },
      {},
      { label: 'Clear Action', enabled: has, value: 'clear' },
    ];
  };

  const runMenu = (slot: number, value: SlotMenuPick) => {
    if (value === 'action' || value === 'icon' || value === 'rename') return open(value, slot, pillOf(slot));
    setPop(null);
    if (value === 'copy') clipboard = cloneSlot(draft.items[slot]);
    else if (value === 'clear') setSlot(slot, emptySlot);
    else if (clipboard) {
      const copy = clipboard;
      setSlot(slot, () => cloneSlot(copy));
    }
  };

  const pickSlot = (slot: number, part: SlotPart, el: HTMLElement) =>
    open(part === 'icon' ? 'icon' : 'action', slot, anchorOf(el));
  const menuAt = (slot: number, e: MouseEvent) => {
    const l = layerRef.current!.getBoundingClientRect();
    open('menu', slot, { x: e.clientX - l.left, y: e.clientY - l.top, w: 0, h: 0 });
  };

  // ---- shortcut ----

  const bindable = isNew || (!!app.val('PieMenuSettings.Enabled') && app.pieOn(id));
  const canRestore = bindable && !!sid && binding !== defaultBinding;
  const canClear = bindable && !!binding;
  const native = sid ? D.known[sid] : undefined;
  const collides = !!native && !!binding && binding === native.key;
  const accent = pageInfo('PieMenus').accent;

  const press = (e: MouseEvent<HTMLButtonElement>) => {
    if (!bindable) return;
    if (e.button === 0) {
      // The caps under the pointer go as capture starts; the default focus would land on nothing.
      e.preventDefault();
      setCapturing(true);
      e.currentTarget.focus();
      return;
    }
    if (capturing && e.button > 0) {
      e.preventDefault();
      const b = bindingFromEvent(e, e.button === 2 ? 1 : e.button === 1 ? 2 : e.button);
      if (b) {
        setBinding(b);
        setCapturing(false);
      }
    }
  };

  const captureKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return setCapturing(false);
    if (MODIFIER_KEYS.includes(e.key)) return;
    const b = bindingFromEvent(e);
    if (b) {
      setBinding(b);
      setCapturing(false);
    }
  };

  // ---- footer ----

  const restore = () =>
    setNotice({
      title: 'Restore Defaults',
      body:
        `Put "${pie?.title}" back the way Blendon ships it?\n\nIts title and items are restored` +
        (bindable ? ', and its shortcut goes back to its default key.' : '.') +
        '\n\nNothing is stored until you Save.',
      ok: 'Restore',
      cancel: 'Cancel',
      run: () => {
        setDraft(defaultDraft(sid));
        if (bindable) setBinding(defaultBinding);
      },
    });

  const save = () =>
    setNotice({
      title: 'Browser demo',
      body:
        (isNew
          ? 'In Unity, Create adds this menu to your custom pie menus and binds its shortcut.'
          : "In Unity, Save keeps these edits and the Scene view's pie uses them straight away.") +
        "\n\nThis is a browser demo, so changes can't be saved here: the menu stays as Blendon ships it.",
      ok: 'Close Editor',
      cancel: 'Keep Editing',
      run: close,
    });

  // Esc peels one layer at a time: the pop-up, the notice, then the window (as Cancel). Listened for on
  // the document, since a closed pop-up can leave the focus nowhere; the shortcut field swallows its own.
  const escape = useRef(close);
  useLayoutEffect(() => {
    escape.current = () => {
      if (pop) setPop(null);
      else if (notice) setNotice(null);
      else close();
    };
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && escape.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!container) return null;

  const popItem = pop ? draft.items[pop.slot] : null;

  return createPortal(
    <div className="uw pe-layer" ref={layerRef} style={iconVars}>
      {shown && (
        <div
          className="pe-win"
          ref={winRef}
          style={{ left: x, top: y, width: W, height: H }}
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? 'New Pie Menu' : 'Edit Pie Menu'}
          tabIndex={-1}
        >
          <div className="pe-bar" onPointerDown={drag}>
            <img src={iconUrl('UnityLogo')} alt="" width={14} height={14} draggable={false} />
            <span className="pe-bt">{isNew ? 'New Pie Menu' : 'Edit Pie Menu'}</span>
            <button className="pe-close" onClick={close} title="Close" aria-label="Close">
              ×
            </button>
          </div>
          <div className="pe-demo">
            <b>BROWSER DEMO</b>
            <span>Try any edit here - the browser can&apos;t save them, so the menu stays as it ships.</span>
          </div>
          <div className="pe-body">
            <div className="pe-field">
              <div className="pe-lbl">
                <div>Title</div>
                <div className="pe-cap">{TitleCaption}</div>
              </div>
              <input
                className="pe-input"
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                aria-label="Title"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className={'pe-field' + (bindable ? '' : ' dis')}>
              <div
                className="pe-lbl"
                title={
                  bindable
                    ? 'Hold to open this pie and release on a direction to run that item, or tap to leave it open for a click'
                    : 'This menu or pie menus as a whole are switched off; switch them back on to give it a shortcut'
                }
              >
                <div>Shortcut</div>
                <div className="pe-cap">{bindable ? ShortcutCaptionEnabled : ShortcutCaptionDisabled}</div>
              </div>
              <div className="scf">
                <button
                  className={'scp' + (capturing ? ' cap' : '')}
                  style={capturing ? { background: accented(accent) } : undefined}
                  onMouseDown={press}
                  onKeyDown={captureKey}
                  onBlur={() => setCapturing(false)}
                  onContextMenu={(e) => capturing && e.preventDefault()}
                  title={
                    (binding ? `${binding}\n\n` : '') +
                    'Click, then press the key combination (or a non-left mouse button) to bind. Esc cancels.'
                  }
                  aria-label="Shortcut"
                >
                  <span className="pt">{capturing ? 'Press a key…' : binding ? '' : 'Not set'}</span>
                  <span className="caps">
                    {!capturing && capTokens(binding).length > 0 && <Caps binding={binding} />}
                  </span>
                </button>
                <button
                  className={'gb rs' + (canRestore ? '' : ' off')}
                  onClick={() => canRestore && setBinding(defaultBinding)}
                  title="Restore this shortcut's default key combination"
                  aria-label="Restore default"
                >
                  ↺
                </button>
                <button
                  className={'gb cl' + (canClear ? '' : ' off')}
                  onClick={() => canClear && setBinding('')}
                  title="Clear this shortcut"
                  aria-label="Clear shortcut"
                >
                  <span style={iconStyle('d_Close', 15)} />
                </button>
              </div>
            </div>
            {collides && (
              <div className="pe-native">
                <span />
                <div className="pe-nt">
                  <span className="nlead">{`Replaces the Editor's native "${native.ul}" command. Open in `}</span>
                  <span
                    className="lnk sm"
                    title={`In Unity this opens the Editor's Shortcuts window at ${native.ul}`}
                    onClick={() =>
                      setNotice({
                        title: 'Demo only',
                        body: `In Unity this opens the Editor's Shortcuts window at ${native.ul}.\n\nThis is only a browser demo, so the Shortcuts window isn't available here.`,
                        ok: 'OK',
                      })
                    }
                  >
                    Unity&apos;s Shortcuts window
                  </span>
                </div>
              </div>
            )}
            <div className="pe-card">
              <div className="pe-ct">Preview</div>
              <div className="pe-cap">{PreviewCaption}</div>
              <PiePreview draft={draft} width={W - RingInset} onPick={pickSlot} onMenu={menuAt} />
            </div>
          </div>
          <div className="pe-foot">
            {!isNew && (
              <button
                className="nb pe-reset"
                onClick={restore}
                title="Put this menu's title, items and shortcut back the way Blendon ships them. Like every other edit here, Cancel still discards it."
              >
                ↺ Restore Defaults
              </button>
            )}
            <span className="pe-note" title={isNew ? 'A menu that you can save and share with others' : pie?.desc}>
              {isNew ? 'Custom pie menu' : 'Built-in pie menu'}
            </span>
            <span className="pe-flex" />
            <button className="nb pe-fb" onClick={close} title="Discard every edit made here">
              Cancel
            </button>
            <button
              className={'nb pe-fb' + (draft.title.trim() ? '' : ' off')}
              onClick={() => draft.title.trim() && save()}
              title={isNew ? 'Add this menu and close' : 'Keep these edits and close'}
            >
              {isNew ? 'Create' : 'Save'}
            </button>
          </div>
          {notice && (
            <div className="dshade">
              <div className="dlg" role="alertdialog" aria-modal="true">
                <div className="dtt">{notice.title}</div>
                <div className="dbd">{notice.body}</div>
                <div className="dbt">
                  <button
                    className="nb pri"
                    onClick={() => {
                      setNotice(null);
                      notice.run?.();
                    }}
                  >
                    {notice.ok}
                  </button>
                  {notice.cancel && (
                    <button className="nb" onClick={() => setNotice(null)}>
                      {notice.cancel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {pop && popItem && (
        <>
          <div
            className="pe-pshield"
            onMouseDown={() => setPop(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPop(null);
            }}
          />
          <div
            className={'pe-pop ' + pop.kind}
            style={{
              left: pop.box.x,
              top: pop.box.y,
              width: pop.box.w,
              height: pop.kind === 'menu' ? undefined : pop.box.h,
            }}
          >
            {pop.kind === 'action' && (
              <ActionPicker
                current={popItem.target}
                onClose={() => setPop(null)}
                onPick={(path) => {
                  setSlot(pop.slot, () => assign(path));
                  setPop(null);
                }}
              />
            )}
            {pop.kind === 'icon' && (
              <IconPicker
                current={popItem.icon}
                onClose={() => setPop(null)}
                onPick={(icon) => {
                  setSlot(pop.slot, (s) => ({ ...s, icon }));
                  setPop(null);
                }}
              />
            )}
            {pop.kind === 'rename' && (
              <Rename
                current={slotLabel(popItem)}
                onClose={() => setPop(null)}
                onDone={(name) => {
                  // The natural name handed back is no rename: a live name (the projection toggle) would freeze.
                  setSlot(pop.slot, (s) => ({ ...s, label: name === naturalName(s.target) ? '' : name }));
                  setPop(null);
                }}
              />
            )}
            {pop.kind === 'menu' && <SlotMenu entries={slotMenu(pop.slot)} onPick={(v) => runMenu(pop.slot, v)} />}
          </div>
        </>
      )}
    </div>,
    container,
  );
}
