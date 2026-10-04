// Draws Blendon's Scene View context menu from its session: panels at the rects the model placed,
// rows as SceneMenuPaint draws them. Pointer input is handed back to the model in view points.
import { useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import { MenuField, SceneMenu } from '../blendon/scenetools/scene-menu/scene-menu.ts';
import {
  quickRect,
  inlineRect,
  rowHeight,
  Theme,
  type Glyph,
  type MenuNode,
  type MenuRow,
} from '../blendon/scenetools/scene-menu/model.ts';
import type { MenuPanel } from '../blendon/scenetools/scene-menu/session.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import { Rect, Vector2 } from '../unity/math.ts';
import styles from './SceneMenu.module.scss';

// SceneMenuGlyphs, on their 16-unit design grid: strokes with round ends, frames inset, erasers as masks.
const line = (w: number, ...p: number[]) => (
  <polyline points={p.join(' ')} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);
const ring = (cx: number, cy: number, r: number, w: number) => (
  <circle cx={cx} cy={cy} r={r} strokeWidth={w} fill="none" />
);
const frame = (x0: number, y0: number, x1: number, y1: number, r: number, w: number, mask?: string) => (
  <rect
    x={x0 + w / 2}
    y={y0 + w / 2}
    width={x1 - x0 - w}
    height={y1 - y0 - w}
    rx={Math.max(0, r - w / 2)}
    strokeWidth={w}
    fill="none"
    mask={mask}
  />
);
const eraser = (id: string, x0: number, y0: number, x1: number, y1: number, r: number) => (
  <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
    <rect width="16" height="16" fill="#fff" />
    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={r} fill="#000" />
  </mask>
);
const clipboard = (id: string) => (
  <>
    {eraser(id, 4.6, 0.8, 11.4, 5.2, 1.4)}
    {frame(2.8, 3.0, 13.2, 14.8, 1.8, 1.35, `url(#${id})`)}
    {frame(5.3, 1.5, 10.7, 4.5, 1.1, 1.35)}
  </>
);

const GlyphArt: Record<Glyph, (id: string) => ReactNode> = {
  Cut: () => (
    <>
      {ring(4.6, 11.4, 2.3, 1.35)}
      {ring(11.4, 11.4, 2.3, 1.35)}
      {line(1.35, 6.0, 9.5, 11.2, 1.8)}
      {line(1.35, 10.0, 9.5, 4.8, 1.8)}
    </>
  ),
  Copy: (id) => (
    <>
      {eraser(id, 1.3, 4.3, 11.2, 15.2, 2.2)}
      {frame(6.0, 1.7, 14.0, 10.5, 1.8, 1.35, `url(#${id})`)}
      {frame(2.0, 5.0, 10.5, 14.5, 1.8, 1.35)}
    </>
  ),
  Paste: (id) => clipboard(id),
  PasteAsChild: (id) => (
    <>
      {clipboard(id)}
      {line(1.2, 6.2, 7.2, 6.2, 11.3, 10.3, 11.3)}
      {line(1.2, 8.9, 9.9, 10.3, 11.3, 8.9, 12.7)}
    </>
  ),
  Duplicate: (id) => (
    <>
      {eraser(id, 1.3, 5.5, 10.9, 15.2, 2.2)}
      {frame(6.0, 1.7, 14.0, 9.8, 1.8, 1.35, `url(#${id})`)}
      {frame(2.0, 6.2, 10.2, 14.5, 1.8, 1.35)}
      {line(1.2, 6.1, 8.3, 6.1, 12.4)}
      {line(1.2, 4.05, 10.35, 8.15, 10.35)}
    </>
  ),
  Rename: () => (
    <>
      {line(1.35, 10.0, 4.6, 2.9, 4.6, 1.6, 5.9, 1.6, 10.1, 2.9, 11.4, 10.0, 11.4)}
      {line(1.35, 13.0, 2.4, 13.0, 13.6)}
      {line(1.2, 11.3, 2.4, 14.7, 2.4)}
      {line(1.2, 11.3, 13.6, 14.7, 13.6)}
    </>
  ),
  Delete: () => (
    <>
      {line(1.35, 2.2, 4.0, 13.8, 4.0)}
      {line(1.2, 6.0, 4.0, 6.4, 1.8, 9.6, 1.8, 10.0, 4.0)}
      {line(1.35, 3.8, 4.0, 4.8, 14.6, 11.2, 14.6, 12.2, 4.0)}
      {line(1.1, 6.9, 6.9, 6.9, 11.8)}
      {line(1.1, 9.1, 6.9, 9.1, 11.8)}
    </>
  ),
  Submenu: () => <polygon points="6.2,4.2 11,8 6.2,11.8" fill="currentColor" stroke="none" />,
  Check: () => line(1.6, 3.2, 8.4, 6.6, 11.8, 12.8, 4.4),
};

let maskId = 0;

function GlyphIcon({ glyph, size = 16 }: { glyph: Glyph; size?: number }) {
  const id = `smg${++maskId}`;
  return (
    <svg
      className={styles.glyph}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      stroke="currentColor"
      aria-hidden="true"
    >
      {GlyphArt[glyph](id)}
    </svg>
  );
}

function NodeIcon({ node }: { node: MenuNode }) {
  if (node.glyph) return <GlyphIcon glyph={node.glyph} />;
  if (node.iconName) return <img className={styles.icon} src={iconUrl(node.iconName)} alt="" />;
  return null;
}

const hintOf = (node: MenuNode) => node.hotkey.replace(/\+/g, ' ');

function ItemRow({ panel, index, row, area }: { panel: MenuPanel; index: number; row: MenuRow; area: Rect }) {
  const selected = panel.selected === index;
  const node = row.node;
  const classic = row.kind === 'classic';
  const enabled = classic || node!.enabled;
  const checked = !!node?.item?.checked;
  const iconNode = row.iconFrom ?? node;
  const cls = [styles.item, selected && styles.selected, !enabled && styles.disabled, classic && styles.quiet]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ top: area.y, height: area.height }}>
      {panel.textOffset > 0 && (
        <span className={styles.gutter}>
          {classic ? (
            <img className={styles.icon} src={iconUrl('d__Menu')} alt="" />
          ) : checked ? (
            <GlyphIcon glyph="Check" />
          ) : (
            iconNode && <NodeIcon node={iconNode} />
          )}
        </span>
      )}
      {row.text && <span className={styles.crumb}>{row.text}</span>}
      <span className={styles.label}>{classic ? 'Classic Unity Menu' : node!.label}</span>
      {node?.isFolder ? (
        <span className={styles.arrow}>
          <GlyphIcon glyph="Submenu" size={12} />
        </span>
      ) : (
        (classic || node!.hotkey) && <span className={styles.hint}>{classic ? 'Shift RMB' : hintOf(node!)}</span>
      )}
    </div>
  );
}

function Row({
  panel,
  index,
  row,
  top,
  quick,
}: {
  panel: MenuPanel;
  index: number;
  row: MenuRow;
  top: number;
  quick: MenuNode[];
}) {
  const area = new Rect(0, top, panel.rect.width, rowHeight(row));
  const selected = panel.selected === index;
  switch (row.kind) {
    case 'separator':
      return <i className={styles.separator} style={{ top: area.y + area.height / 2 }} />;
    case 'label':
      return (
        <div className={styles.section} style={{ top: area.y, height: area.height }}>
          {row.text}
        </div>
      );
    case 'quick':
      return (
        <>
          {quick.map((node, i) => {
            const r = quickRect(area, i);
            const hot = selected && panel.column === i;
            return (
              <span
                key={node.key}
                className={[
                  styles.quickButton,
                  hot && (node.enabled ? styles.hot : styles.hotOff),
                  !node.enabled && styles.disabled,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
              >
                <NodeIcon node={node} />
              </span>
            );
          })}
        </>
      );
    case 'inline':
      return (
        <>
          {row.nodes!.map((node, i) => {
            const r = inlineRect(area, row.nodes!, i);
            const hot = selected && panel.column === i;
            return (
              <span
                key={node.key}
                className={[
                  styles.inlineButton,
                  hot && (node.enabled ? styles.hot : styles.hotOff),
                  !node.enabled && styles.disabled,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
              >
                <NodeIcon node={node} />
                <span>{node.label}</span>
              </span>
            );
          })}
        </>
      );
    default:
      return <ItemRow panel={panel} index={index} row={row} area={area} />;
  }
}

function Tooltip({ panel, quick }: { panel: MenuPanel; quick: MenuNode[] }) {
  if (panel.selected < 0 || panel.rows[panel.selected]?.kind !== 'quick') return null;
  const node = quick[panel.column];
  if (!node) return null;
  const r = panel.rowRect(panel.selected);
  // Panel-local, like everything drawn inside it.
  const button = quickRect(new Rect(0, r.y - panel.rect.y, r.width, r.height), panel.column);
  const hint = node.item ? hintOf(node) : '';
  return (
    <div className={styles.tooltip} style={{ left: button.center.x, top: button.yMax + 4 }}>
      <span className={node.enabled ? '' : styles.disabled}>{node.label}</span>
      {hint && <span className={styles.tooltipHint}>{hint}</span>}
    </div>
  );
}

export function SceneMenuView({ host }: { host: SceneHost }) {
  useSyncExternalStore(SceneMenu.subscribe, () => SceneMenu.version);
  const session = SceneMenu.session;
  if (!session) return null;

  const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const frame = (e.currentTarget.closest('[role=application]') ?? e.currentTarget).getBoundingClientRect();
    return new Vector2(e.clientX - frame.left, e.clientY - frame.top);
  };
  const focusView = () => host.focusRoot.focus({ preventScroll: true });

  const onMove = (e: PointerEvent<HTMLDivElement>) => SceneMenu.hover(local(e));
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('input')) return;
    // Keeps the search box focused while a row is clicked.
    e.preventDefault();
    SceneMenu.press(local(e), e.button);
    if (!SceneMenu.isOpen) focusView();
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => SceneMenu.scroll(local(e), e.deltaY * 0.6);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (SceneMenu.key(e.key === 'Enter' && e.nativeEvent.code === 'NumpadEnter' ? 'NumpadEnter' : e.key))
      e.preventDefault();
    if (!SceneMenu.isOpen) focusView();
  };

  return (
    <div className={styles.layer}>
      {session.panels.map((panel, k) => {
        const body = panel.body;
        let y = -panel.scroll;
        const rowEls = panel.rows.map((row, i) => {
          const top = y;
          y += rowHeight(row);
          return <Row key={i} panel={panel} index={i} row={row} top={top} quick={session.model.quick} />;
        });
        const thumb = panel.maxScroll > 0 ? Math.max(16, (body.height * body.height) / panel.contentHeight) : 0;
        return (
          <div
            key={k}
            className={styles.panel}
            style={{ left: panel.rect.x, top: panel.rect.y, width: panel.rect.width, height: panel.rect.height }}
            onPointerMove={onMove}
            onPointerDown={onDown}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
          >
            {panel.hasHeader && (
              <div className={styles.header} style={{ height: Theme.HeaderHeight }}>
                <img className={styles.titleIcon} src={iconUrl(SceneMenu.titleIcon)} alt="" />
                {MenuField.renaming ? (
                  <input
                    className={styles.rename}
                    value={MenuField.rename}
                    autoFocus
                    spellCheck={false}
                    onChange={(e) => SceneMenu.setRename(e.target.value)}
                    onKeyDown={onKey}
                    onFocus={(e) => e.target.select()}
                  />
                ) : (
                  <>
                    <span
                      className={styles.title + (MenuField.renameTarget ? ' ' + styles.renamable : '')}
                      onPointerDown={(e) => {
                        if (!MenuField.renameTarget || e.button !== 0) return;
                        e.stopPropagation();
                        e.preventDefault();
                        SceneMenu.beginRename();
                      }}
                    >
                      {session.title}
                    </span>
                    <label className={styles.search} style={{ width: Theme.SearchWidth, height: Theme.SearchHeight }}>
                      <img src={iconUrl('d_Search Icon')} alt="" />
                      <input
                        value={MenuField.search}
                        placeholder="Search"
                        autoFocus
                        spellCheck={false}
                        aria-label="Search the menu"
                        onChange={(e) => SceneMenu.setSearch(e.target.value)}
                        onKeyDown={onKey}
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            <div className={styles.body} style={{ top: body.y - panel.rect.y, height: body.height }}>
              {rowEls}
            </div>
            {thumb > 0 && (
              <i
                className={styles.thumb}
                style={{
                  top: body.y - panel.rect.y + (body.height - thumb) * (panel.scroll / panel.maxScroll),
                  height: thumb,
                }}
              />
            )}
            {panel.isRoot && <Tooltip panel={panel} quick={session.model.quick} />}
          </div>
        );
      })}
    </div>
  );
}
