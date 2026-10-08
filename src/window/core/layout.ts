// Window geometry and the page body for one render: SettingsEditorWindow.OnGUI's layout pass.
import type { CatalogPage } from '../../plugin/schema.ts';
import { D } from '../../plugin/window-data.ts';
import { Builder, type Row } from './builder.ts';
import type { WindowModel } from './model.ts';
import { clamp, M, MIN_QUERY } from './util.ts';

export interface SideEntry {
  key: string;
  group?: { label: string; gap: boolean };
  /** The collapsed sidebar's divider between groups. */
  rule?: boolean;
  page?: CatalogPage;
  selected?: boolean;
  enabled?: boolean;
  /** Search hits on this page, or -1 when not searching. */
  matches?: number;
}

export interface WindowLayout {
  winW: number;
  winH: number;
  collapsed: boolean;
  sideW: number;
  listH: number;
  sideScroll: boolean;
  side: SideEntry[];
  contentW: number;
  /** The width the page is laid out at; past the view when the pie tables need it. */
  layoutW: number;
  scrollsX: boolean;
  rOff: number;
  showSearch: boolean;
  searchW: number;
  query: string;
  searching: boolean;
  matchCount: number;
  rows: Row[];
  page: string;
  showReset: boolean;
  showResetAll: boolean;
  footerTip: boolean;
}

function drawPage(b: Builder, page: string) {
  if (!b.searching) b.beginPass(page);
  b.run(D.pages[page] ?? []);
}

export function layoutWindow(app: WindowModel): WindowLayout {
  const st = app.st;
  const page = st.page;
  const hostW = st.hostW ?? 1100;
  const isPhone = hostW < 700;
  const winW = clamp(st.winW ?? Math.min(1100, hostW), Math.min(isPhone ? 320 : 567, hostW), hostW);
  const winH = st.winH ?? (isPhone ? 640 : 740);
  // The window frame has a 1px border, so the editor area is 2px smaller than the frame.
  const frame = st.docked ? 0 : 2;
  const innerW = winW - frame;
  const bodyH = winH - frame - (st.docked ? 0 : M.tabH);
  const collapsed = app.sideCollapsedNow();

  // Sidebar
  const listH = bodyH - M.sideFooter;
  let sideContentH = collapsed ? 0 : M.sidePadT;
  let lastGroup = '';
  for (const p of D.catalog) {
    if (p.group !== lastGroup) {
      if (lastGroup) sideContentH += M.sideGap;
      sideContentH += collapsed ? (lastGroup ? M.railGap : 0) : M.sideGroup;
      lastGroup = p.group;
    }
    sideContentH += collapsed ? M.sideRail : M.sideItem;
  }
  sideContentH += collapsed ? 0 : M.sidePadB;
  const sideScroll = sideContentH > listH;
  const sideBase = collapsed
    ? M.sideCollapsed
    : clamp(st.sideW ?? M.sideMin, M.sideMin, Math.min(M.sideMax, Math.max(M.sideMin, innerW - M.minContent)));
  const sideW = sideBase + (sideScroll ? M.sideSb : 0);
  const contentW = innerW - sideW - 1;
  const pageW = contentW - M.contentPad * 2 - M.sb;

  // Search
  const query = st.search.length >= MIN_QUERY ? st.search : '';
  const searching = query.length > 0;
  app.searching = searching;
  const build = (pw: number) => {
    app.pageW = pw;
    if (searching) {
      // A dry run finds the pages with hits, so only those get a card.
      const dry = new Builder(app, pw, true, query);
      for (const info of D.catalog) {
        dry.beginPage(info);
        drawPage(dry, info.id);
      }
      const b = new Builder(app, pw, true, query);
      for (const info of D.catalog) {
        if (!dry.pageMatches[info.id]) continue;
        b.beginPage(info);
        drawPage(b, info.id);
      }
      b.endWrap();
      b.pageMatches = dry.pageMatches;
      return b;
    }
    const b = new Builder(app, pw, false, '');
    b.beginPass(page);
    if (page !== 'Overview' && !app.val('GeneralSettings.Enabled')) {
      b.banner(true, D.consts.masterOffWarning ?? '');
      b.pageLink('Overview', 'Switch Blendon back on');
      b.dis++;
      drawPage(b, page);
      b.dis--;
    } else drawPage(b, page);
    b.endWrap();
    return b;
  };
  // The pie lists' rows are fixed-width horizontal groups, so IMGUI widens the whole page past
  // the view and scrolls it sideways rather than squeezing them (491 + the cell's padding).
  let layoutW = pageW;
  let b = build(pageW);
  if (
    pageW < M.pieMinW &&
    b.rows.some((r) => r.cells.some((c) => c.items.some((i) => i.k === 'pieTable' || i.k === 'pieFooter')))
  ) {
    layoutW = M.pieMinW;
    b = build(layoutW);
  }

  // Header: ContentRight is read back from the page's own cards, so a widened page pushes the
  // search box out too.
  const contentRight = sideW + 1 + M.contentPad + layoutW;
  const avail = contentRight - (sideW + 1 + M.chromePad) - M.headerTextMin;

  // Sidebar entries
  const side: SideEntry[] = [];
  lastGroup = '';
  for (const p of D.catalog) {
    if (p.group !== lastGroup) {
      side.push(
        collapsed
          ? { key: 'g' + p.group, rule: !!lastGroup }
          : { key: 'g' + p.group, group: { label: p.group, gap: !!lastGroup } },
      );
      lastGroup = p.group;
    }
    side.push({
      key: p.id,
      page: p,
      selected: p.id === page,
      enabled: app.pageEnabled(p.id),
      matches: searching ? (b.pageMatches[p.id] ?? 0) : -1,
    });
  }

  const isOverview = page === 'Overview';
  const showReset = isOverview ? !searching : page !== 'Keyboard';
  return {
    winW,
    winH,
    collapsed,
    sideW,
    listH,
    sideScroll,
    side,
    contentW,
    layoutW,
    scrollsX: layoutW > pageW,
    rOff: contentW - M.contentPad - layoutW,
    showSearch: avail >= M.searchMin,
    searchW: Math.min(M.searchW, avail),
    query,
    searching,
    matchCount: b.match,
    rows: b.rows,
    page,
    showReset: showReset && !isOverview,
    showResetAll: isOverview && !searching,
    footerTip: contentW - M.chromePad * 2 - (showReset ? (isOverview ? 132 : 142) + M.chromePad : 0) >= 300,
  };
}
