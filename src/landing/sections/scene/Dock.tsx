// The Try It dock: Unity's Scene view and the Blendon window as two tabs of one dock area, or side by
// side on a wide screen. Both panes stay mounted whatever the layout, so neither loses its state.
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../../lib/cx.ts';
import { useMediaQuery } from '../../../lib/hooks.ts';
import styles from './Dock.module.scss';
import { SceneSlot } from './SceneSlot.tsx';
import { WindowSlot } from './WindowSlot.tsx';

type Pane = 'scene' | 'blendon';

const SPLIT_SCREEN = '(min-width: 1366px)';
const MIN_SCENE = 420;
const MIN_WINDOW = 420;
// The reference layout gives the window 58 %; on a smaller screen the Scene view keeps the room and the
// window narrows to its collapsed sidebar.
const WIDE_DOCK = 1800;

function defaultFraction(width: number) {
  if (width <= 0 || width >= WIDE_DOCK) return 0.42;
  const win = Math.min(Math.max(width * 0.38, 480), 620);
  return Math.max(0.3, 1 - win / width);
}
const SCENE_ICON = `${import.meta.env.BASE_URL}scene/icons/d_UnityEditor.SceneView.png`;

interface KeyboardLock {
  lock?(keys: string[]): Promise<void>;
  unlock?(): void;
}
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

// Full screen support never changes; the prerendered page goes without the button until hydrated.
const noChange = () => () => {};

// The Scene view tutorial's "Open Blendon's settings" task: showing or using the window is opening them.
const settingsOpened = () => window.dispatchEvent(new Event('blendon:settings-opened'));

/** `page`: the dock is the whole page (the stand-alone Playground), with no link out to itself. */
export function Dock({ page = false }: { page?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery(SPLIT_SCREEN);
  // Side by side by default only where there is room; the button switches it anywhere.
  const [splitPref, setSplitPref] = useState<boolean | null>(null);
  const split = splitPref ?? wide;
  const [width, setWidth] = useState(0);
  // Tabs: the one shown. Split: the one last used, whose tab carries the focus line.
  const [active, setActive] = useState<Pane>('scene');
  const [dragged, setFraction] = useState<number | null>(null);
  const fraction = dragged ?? defaultFraction(width);
  const [full, setFull] = useState(false);
  const canFull = useSyncExternalStore(
    noChange,
    () => document.fullscreenEnabled,
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === ref.current;
      setFull(on);
      // Esc cancels grabs and closes menus here; held, it still leaves full screen.
      if (on)
        keyboard()
          ?.lock?.(['Escape'])
          .catch(() => {});
      else keyboard()?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The page's Playground links, and a shortcut tip's "Open in Blendon", open the Blendon tab.
  useEffect(() => {
    const fromHash = () => {
      if (location.hash === '#playground') setActive('blendon');
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('a[href="#playground"]')) setActive('blendon');
    };
    const toKeyboard = () => setActive('blendon');
    fromHash();
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('blendon:open-keyboard', toKeyboard);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', fromHash);
      window.removeEventListener('blendon:open-keyboard', toKeyboard);
      document.removeEventListener('click', onClick);
    };
  }, []);

  const pick = (pane: Pane) => {
    setActive(pane);
    if (pane === 'blendon') settingsOpened();
    // A picked Scene tab takes the keyboard, as clicking into the view would.
    else
      requestAnimationFrame(() =>
        ref.current?.querySelector<HTMLElement>('[role=application]')?.focus({ preventScroll: true }),
      );
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => {});
  };

  const dragDivider = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const box = ref.current.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const min = MIN_SCENE / box.width;
      const max = 1 - MIN_WINDOW / box.width;
      setFraction(Math.min(Math.max((ev.clientX - box.left) / box.width, min), Math.max(min, max)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const at = `${(fraction * 100).toFixed(3)}%`;
  const paneStyle = (pane: Pane): CSSProperties =>
    !split ? {} : pane === 'scene' ? { right: `calc(100% - ${at} + 2px)` } : { left: `calc(${at} + 2px)` };
  const hidden = (pane: Pane) => !split && active !== pane;

  const tools = (
    <div className={styles.tools}>
      <ToolButton
        label="Reset the scene and every setting"
        pressed={false}
        onClick={() => window.dispatchEvent(new Event('blendon:reset'))}
      >
        <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4" />
        <path d="M2.2 1.8v3.4h3.4" />
      </ToolButton>
      <ToolButton
        label={split ? 'Show as tabs' : 'Show side by side'}
        pressed={split}
        onClick={() => setSplitPref(!split)}
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
        <path d="M8 2.5v11" />
      </ToolButton>
      {canFull && (
        <ToolButton label={full ? 'Exit full screen' : 'Full screen'} pressed={full} onClick={toggleFull}>
          {full ? (
            <path d="M6 1.5v4.5H1.5M10 1.5v4.5h4.5M6 14.5V10H1.5M10 14.5V10h4.5" />
          ) : (
            <path d="M1.5 6V1.5H6M10 1.5h4.5V6M1.5 10v4.5H6M14.5 10v4.5H10" />
          )}
        </ToolButton>
      )}
      {!page && (
        <a
          className={styles.tool}
          href={`${import.meta.env.BASE_URL}playground/`}
          target="_blank"
          rel="noopener"
          title="Open the Playground on a page of its own"
          aria-label="Open the Playground on a page of its own"
        >
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
            <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" />
          </svg>
        </a>
      )}
    </div>
  );

  const sceneTab = <Tab pane="scene" active={active} split={split} onPick={pick} />;
  const blendonTab = <Tab pane="blendon" active={active} split={split} onPick={pick} />;

  return (
    <div ref={ref} className={cx(styles.dock, page && styles.page, full && styles.full)} data-playground="">
      {!page && <span id="playground" className={styles.anchor} />}
      {split ? (
        <>
          <Strip style={paneStyle('scene')} tabs={sceneTab} />
          <Strip style={paneStyle('blendon')} tabs={blendonTab} tools={tools} />
          <div
            className={styles.divider}
            style={{ left: `calc(${at} - 2px)` }}
            onPointerDown={dragDivider}
            onDoubleClick={() => setFraction(null)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the panes"
          />
        </>
      ) : (
        <Strip
          tabs={
            <div role="tablist" aria-label="Try It" className={styles.tablist}>
              {sceneTab}
              {blendonTab}
            </div>
          }
          tools={tools}
        />
      )}
      <div
        className={cx(styles.pane, hidden('scene') && styles.hidden)}
        style={paneStyle('scene')}
        inert={hidden('scene')}
        onPointerDownCapture={() => setActive('scene')}
      >
        <SceneSlot />
      </div>
      <div
        className={cx(styles.pane, hidden('blendon') && styles.hidden)}
        style={paneStyle('blendon')}
        inert={hidden('blendon')}
        onPointerDownCapture={() => {
          setActive('blendon');
          settingsOpened();
        }}
      >
        <WindowSlot />
      </div>
    </div>
  );
}

function Tab({ pane, active, split, onPick }: { pane: Pane; active: Pane; split: boolean; onPick: (p: Pane) => void }) {
  const selected = split || active === pane;
  return (
    <button
      type="button"
      role={split ? undefined : 'tab'}
      aria-selected={split ? undefined : selected}
      className={cx(styles.tab, selected && styles.selected, active === pane && styles.focused)}
      onClick={() => onPick(pane)}
    >
      {pane === 'scene' && <img src={SCENE_ICON} alt="" width={16} height={16} />}
      {pane === 'scene' ? 'Scene' : 'Blendon'}
    </button>
  );
}

/** A dock area's tab strip: its tabs, Unity's add-tab cross and window menu dots (pictures only). */
function Strip({ tabs, tools, style }: { tabs: ReactNode; tools?: ReactNode; style?: CSSProperties }) {
  return (
    <div className={styles.strip} style={style}>
      {tabs}
      <span className={styles.plus} aria-hidden="true" title="Add Tab (not in this demo)" />
      <span className={styles.spacer} />
      {tools}
      <span className={styles.kebab} aria-hidden="true" title="Window menu (not in this demo)">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(styles.tool, pressed && styles.pressed)}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
