// The settings window: chrome, sidebar, page body and overlays around the laid-out rows.
import { type CSSProperties, useLayoutEffect } from 'react';
import type { Row } from '../core/builder.ts';
import { iconStyle } from '../core/icons.ts';
import { type SideEntry, type WindowLayout } from '../core/layout.ts';
import { type WindowModel, pageInfo } from '../core/model.ts';
import { M, PAL, badgeFill, brighten, rgba, tinted } from '../core/util.ts';
import { Runs } from './common.tsx';
import { AppContext, useApp, useTip } from './context.ts';
import { ItemView } from './Items.tsx';

function SideItem({ s, collapsed, searching }: { s: SideEntry; collapsed: boolean; searching: boolean }) {
  const app = useApp();
  const p = s.page!;
  const matches = s.matches ?? -1;
  const enabled = !!s.enabled;
  const tip = {
    t:
      p.label +
      (searching ? (matches > 0 ? ` - ${matches} matching` : ' - no matches') : '') +
      (enabled ? '' : '\nThis feature is off - its shortcuts are parked'),
    native: true,
  };
  const ind = p.indent && !collapsed;
  return (
    <button
      className={'si' + (s.selected ? ' sel' : '') + (enabled ? '' : ' off') + (ind ? ' ind' : '')}
      onClick={() => app.goTo(p.id)}
      onMouseEnter={(e) => collapsed && app.tipIn(e, tip)}
      onMouseLeave={() => app.tipOut()}
      aria-label={p.label}
    >
      <span className="pill" />
      <span className="sic idle" style={iconStyle(p.icon, 16, null, 0.561)} />
      <span className="sic hov" style={iconStyle(p.icon, 16, p.accent)} />
      <span className="sic selc" style={iconStyle(p.icon, 16, brighten(p.accent))} />
      <span className="stx">{p.label}</span>
      <span className="sbadge" style={{ color: matches > 0 ? p.accent : PAL.caption }}>
        {searching ? (matches > 0 ? String(matches) : '–') : ''}
      </span>
    </button>
  );
}

interface ScrollbarProps {
  className: string;
  target: () => HTMLElement | null;
  track: (el: HTMLElement | null) => void;
  thumb: (el: HTMLElement | null) => void;
  horizontal?: boolean;
}

/** Unity 6's dark scrollbar: arrow buttons, a track that pages and a draggable thumb. */
function Scrollbar({ className, target, track, thumb, horizontal = false }: ScrollbarProps) {
  const app = useApp();
  const step = (d: number) => () => {
    const el = target();
    if (!el) return;
    if (horizontal) el.scrollLeft += d;
    else el.scrollTop += d;
  };
  return (
    <div className={className}>
      <button
        className={'sba ' + (horizontal ? 'lf' : 'up')}
        onClick={step(-20)}
        aria-label={horizontal ? 'Scroll left' : 'Scroll up'}
      />
      <div
        className="sbt"
        ref={track}
        onPointerDown={(e) =>
          app.trackPage(e, target(), horizontal ? app.inst.hthumb : thumbOf(app, target()), horizontal)
        }
      >
        <i
          className="sbth"
          ref={thumb}
          onPointerDown={(e) => app.thumbDrag(e, target(), e.currentTarget.parentElement, horizontal)}
        />
      </div>
      <button
        className={'sba ' + (horizontal ? 'rt' : 'dn')}
        onClick={step(20)}
        aria-label={horizontal ? 'Scroll right' : 'Scroll down'}
      />
    </div>
  );
}

const thumbOf = (app: WindowModel, el: HTMLElement | null) =>
  el === app.inst.sscroll ? app.inst.sthumb : app.inst.thumb;

function FoldHead({ row }: { row: Row }) {
  const app = useApp();
  const w = row.wrap!;
  const tip = useTip({ t: w.tip ?? '', native: true });
  const count = w.count ?? 0;
  return (
    <div
      className="fh"
      onClick={() => app.update((s) => ({ folds: { ...s.folds, [w.key!]: !w.open } }))}
      {...tip}
      role="button"
      tabIndex={0}
      aria-expanded={w.open}
    >
      <span className="fbox">{w.open ? '▾' : '▸'}</span>
      <span className="fic" style={iconStyle('d_Grid.PaintTool', 16)} />
      <span className="fot">{w.title}</span>
      <span className="fcnt">{!w.open && count > 0 ? (count === 1 ? '1 setting' : `${count} settings`) : ''}</span>
    </div>
  );
}

function CardHead({ row }: { row: Row }) {
  const app = useApp();
  const w = row.wrap!;
  const accent = w.accent;
  const tip = useTip(w.group ? null : { t: `Open the ${pageInfo(w.page ?? '').label} settings page`, native: true });
  const color: CSSProperties = { color: tinted(accent) };
  return (
    <div className="ch">
      <span className="chtile" style={{ background: rgba(accent, 0.16) }}>
        <span style={iconStyle(w.icon ?? '', 11, accent)} />
      </span>
      {w.group ? (
        <span className="chl" style={color}>
          {w.label}
        </span>
      ) : (
        <button className="chl lk" style={color} onClick={() => app.goTo(w.page ?? '')} {...tip}>
          {w.label}
        </button>
      )}
    </div>
  );
}

function RowView({ row }: { row: Row }) {
  const w = row.wrap;
  const first = !!w && w.rows[0] === row;
  const last = !!w && w.rows[w.rows.length - 1] === row;
  const cls =
    'row' +
    (row.bare ? ' bare' : '') +
    (row.grid ? ' grid' : '') +
    (w ? ' in-' + w.kind : '') +
    (first ? ' wfirst' : '') +
    (last ? ' wlast' : '') +
    (w?.kind === 'fold' && !w.open ? ' shut' : '');
  const mt = row.mt || 0;
  const style: Record<string, string | number> = {};
  if (w) {
    if (first) style.marginTop = 15;
    else style.paddingTop = mt;
  } else style.marginTop = mt;
  if (row.after) style[w && !last ? 'paddingBottom' : 'marginBottom'] = row.after;
  if (w) style['--acc'] = rgba(w.accent, 0.55);
  return (
    <div className={cls} style={style}>
      {first && w.kind === 'fold' && <FoldHead row={row} />}
      {first && w.kind === 'card' && <CardHead row={row} />}
      {first && !row.empty && mt > 0 && <div style={{ height: mt }} />}
      <div className="cells">
        {row.cells.map((c, i) => (
          <div
            key={i}
            className={
              'cell' + (c.bare ? ' bare' : ' boxed') + (c.span === 2 ? ' span2' : '') + (c.master ? ' master' : '')
            }
            style={{ '--lw': Math.round(c.lw) + 'px' } as CSSProperties}
          >
            {c.items.map((it) => (
              <ItemView key={it.key} it={it} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ L }: { L: WindowLayout }) {
  const app = useApp();
  const st = app.st;
  const info = pageInfo(L.page);
  const title = L.searching ? `Results for "${L.query}"` : info.label;
  const subtitle = L.searching
    ? L.matchCount === 1
      ? '1 setting across all pages'
      : `${L.matchCount} settings across all pages`
    : info.summary;
  return (
    <div className="hdr">
      <span className="badge" style={{ background: L.searching ? PAL.brand : badgeFill(info.accent) }}>
        <span style={iconStyle(L.searching ? 'd_Search Icon' : info.icon, 15, '#FFFFFF')} />
      </span>
      <div className="htx" style={{ right: L.showSearch ? L.searchW + M.chromePad + L.rOff : L.rOff }}>
        <div className="htitle">{title}</div>
        <div className="hsub">{subtitle}</div>
      </div>
      {L.showSearch && (
        <label className={'sbox' + (st.searchFocus ? ' foc' : '')} style={{ width: L.searchW, right: L.rOff }}>
          <span className="smag" style={iconStyle('d_Search Icon', 13, PAL.caption)} />
          <input
            className="sin"
            type="text"
            value={st.search}
            onChange={(e) => app.update({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                app.update({ search: '' });
                e.currentTarget.blur();
              }
            }}
            onFocus={() => app.update({ searchFocus: true })}
            onBlur={() => app.update({ searchFocus: false })}
            aria-label="Search settings"
            spellCheck={false}
            autoComplete="off"
          />
          {!st.search && !st.searchFocus && <span className="sph">Search...</span>}
          {st.search.length > 0 && (
            <button className="sclr" onClick={() => app.update({ search: '' })} aria-label="Clear the search box">
              <span style={iconStyle('d_Close', 14)} />
            </button>
          )}
        </label>
      )}
    </div>
  );
}

function Footer({ L }: { L: WindowLayout }) {
  const app = useApp();
  const info = pageInfo(L.page);
  const linkTip = useTip({ t: "Open Unity's own Shortcuts window", native: true });
  const resetTip = useTip({ t: 'Put every setting on this page back to the value Blendon ships', native: true });
  const resetAllTip = useTip({
    t: '<b>Reset All Pages</b>\nRestores every Blendon setting on every page, shortcuts included, to what the plugin ships with.',
    native: true,
  });
  return (
    <div className="ftr">
      {L.footerTip && (
        <div className="tipbar">
          <span className="bulb">
            <span style={iconStyle('TipBulb', 10.5, '#F2D933')} />
          </span>
          <span className="tlead">Tip: Blendon&apos;s keys can also be edited in </span>
          <span
            className="lnk sm2"
            onClick={() => app.demo("In Unity this opens the Editor's Shortcuts window, filtered to Blendon's keys.")}
            {...linkTip}
          >
            Unity Preferences &gt; Shortcuts
          </span>
        </div>
      )}
      {L.showReset && (
        <button
          className="rbtn"
          onClick={() =>
            app.confirm({
              title: 'Reset Settings',
              body: `Reset "${info.label}" settings to defaults?`,
              ok: 'Reset',
              run: () => app.resetPage(L.page),
            })
          }
          {...resetTip}
        >
          {'↺  Reset to Defaults'}
        </button>
      )}
      {L.showResetAll && (
        <button
          className="rbtn danger"
          onClick={() =>
            app.confirm({
              title: 'Reset All Pages',
              body: 'Reset every Blendon setting on every page to its default?\n\nCustom pie menus are kept.',
              ok: 'Reset All',
              run: () => app.resetAll(),
            })
          }
          {...resetAllTip}
        >
          {'↺  Reset All Pages'}
        </button>
      )}
    </div>
  );
}

function Overlays() {
  const app = useApp();
  const { tip, menu, dlg } = app.st;
  const tipStyle: CSSProperties | undefined = tip
    ? {
        left: tip.measured ? tip.x : -9999,
        top: tip.measured ? tip.y : 0,
        ...(tip.rich ? { width: tip.w } : { maxWidth: 360 }),
      }
    : undefined;
  return (
    <>
      {tip?.rich && (
        <div className="rtip" ref={(el) => app.placeTip(el)} style={tipStyle}>
          <div className="rtx">
            <Runs runs={tip.runs} />
          </div>
          {tip.img && (
            <img className="rimg" src={tip.img} style={tip.aspect ? { aspectRatio: tip.aspect } : undefined} alt="" />
          )}
        </div>
      )}
      {tip && !tip.rich && (
        <div className="ntip" ref={(el) => app.placeTip(el)} style={tipStyle}>
          <Runs runs={tip.runs} />
        </div>
      )}
      {menu && (
        <>
          <div
            className="mshield"
            onMouseDown={(e) => {
              e.preventDefault();
              app.update({ menu: null });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              app.update({ menu: null });
            }}
          />
          <div
            className="menu"
            ref={(el) => app.placeMenu(el)}
            style={{
              left: menu.x,
              top: menu.y,
              minWidth: Math.max(menu.minW, 80),
              visibility: menu.placed ? undefined : 'hidden',
            }}
            role="menu"
          >
            {menu.items.map((m, i) => (
              <button
                key={i}
                className={'mi' + (m.sep ? ' sep' : '') + (m.disabled ? ' dis' : '') + (m.on ? ' on' : '')}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (m.disabled || m.sep) return;
                  const pick = app.inst.menuPick;
                  if (!menu.multi) app.update({ menu: null });
                  pick?.(m.value, i);
                }}
                role="menuitemcheckbox"
                aria-checked={!!m.on}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      {dlg && (
        <div className="dshade">
          <div className="dlg" role="dialog" aria-modal="true">
            <div className="dtt">{dlg.title}</div>
            <div className="dbd">{dlg.body}</div>
            <div className="dbt">
              <button
                className="nb pri"
                onClick={() => {
                  app.update({ dlg: null });
                  dlg.run?.();
                }}
              >
                {dlg.ok}
              </button>
              {!dlg.single && (
                <button className="nb" onClick={() => app.update({ dlg: null })}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface WindowProps {
  app: WindowModel;
  L: WindowLayout;
  iconVars: CSSProperties;
}

export function SettingsWindow(props: WindowProps) {
  return (
    <AppContext value={props.app}>
      <WindowFrame {...props} />
    </AppContext>
  );
}

function WindowFrame({ app, L, iconVars }: WindowProps) {
  const st = app.st;
  const inst = app.inst;
  // Thumb geometry follows every render (and every scroll, below).
  useLayoutEffect(() => app.syncScrollbars());
  const winStyle = {
    ...iconVars,
    width: L.winW,
    height: L.winH,
    '--li': (st.li ?? 24.3) + 'px',
  } as CSSProperties;
  const sideTip = useTip({
    t: st.sideCollapsed ? 'Show the section names' : 'Collapse the sidebar to icons',
    native: true,
  });
  return (
    <div
      className={'uw' + (L.collapsed ? ' collapsed' : '') + (L.searching ? ' searching' : '')}
      ref={app.attach('win')}
      style={winStyle}
      onMouseDown={() => app.dismissTip()}
      onWheel={() => app.dismissTip()}
    >
      <span className="lim" data-li>
        {'       '}
      </span>
      <div className="tabbar">
        <div className="tab">Blendon</div>
        <span
          className="kebab"
          role="button"
          aria-label="Window menu"
          onClick={() => app.demo("In Unity this opens the window's tab menu: Maximize, Close Tab, Add Tab.")}
        >
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="ubody">
        <div className="side" style={{ width: L.sideW }}>
          <div className="slist" style={{ height: L.listH }}>
            <div className="sscroll" ref={app.attach('sscroll')} onScroll={() => app.syncScrollbars()}>
              <div style={{ height: L.collapsed ? 0 : 5 }} />
              {L.side.map((s) =>
                s.group ? (
                  <div key={s.key} className={'sg' + (s.group.gap ? ' gap' : '')}>
                    {s.group.label}
                  </div>
                ) : s.rule ? (
                  <div key={s.key} className="sr">
                    <i />
                  </div>
                ) : s.page ? (
                  <SideItem key={s.key} s={s} collapsed={L.collapsed} searching={L.searching} />
                ) : null,
              )}
              <div style={{ height: 5 }} />
            </div>
            {L.sideScroll && (
              <Scrollbar
                className="vsb side-sb"
                target={() => inst.sscroll}
                track={app.attach('strack')}
                thumb={app.attach('sthumb')}
              />
            )}
          </div>
          <button
            className="sfoot"
            onClick={() => app.update({ sideCollapsed: !app.sideCollapsedNow() })}
            {...sideTip}
            aria-label={L.collapsed ? 'Show the section names' : 'Collapse the sidebar to icons'}
          >
            {L.collapsed ? '»' : '«'}
          </button>
        </div>
        <div
          className="split"
          style={{ left: L.sideW - 3 }}
          onPointerDown={(e) => app.splitDrag(e)}
          onDoubleClick={() => app.update({ sideCollapsed: !st.sideCollapsed })}
        />
        <div className="content" style={{ left: L.sideW + 1, width: L.contentW }}>
          <Header L={L} />
          <div className={'view' + (L.scrollsX ? ' hx' : '')}>
            <div
              className="scroll"
              ref={app.attach('scroll')}
              onScroll={() => {
                app.syncScrollbars();
                app.dismissTip();
              }}
            >
              <div className="pagebody" style={L.scrollsX ? { width: L.layoutW + M.contentPad * 2 } : undefined}>
                {L.rows.map((r) => (
                  <RowView key={r.id} row={r} />
                ))}
                {L.searching && L.matchCount === 0 && <div className="nores">No results for &quot;{L.query}&quot;</div>}
                <div style={{ height: 12 }} />
              </div>
            </div>
            <Scrollbar
              className="vsb main-sb"
              target={() => inst.scroll}
              track={app.attach('track')}
              thumb={app.attach('thumb')}
            />
            <Scrollbar
              className="hsb"
              horizontal
              target={() => inst.scroll}
              track={app.attach('htrack')}
              thumb={app.attach('hthumb')}
            />
          </div>
          <Footer L={L} />
        </div>
      </div>
      <Overlays />
      <div className="grip" onPointerDown={(e) => app.gripDrag(e)} aria-hidden="true" />
      {st.resizing && (
        <div className="sizetag">
          {L.winW} × {L.winH}
        </div>
      )}
    </div>
  );
}
