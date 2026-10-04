import type { CSSProperties, MouseEvent } from 'react';
import type { Item } from '../core/builder.ts';
import type { WindowModel } from '../core/model.ts';
import { pageInfo } from '../core/model.ts';
import { rgba } from '../core/util.ts';

/** IMGUI draws labels after LabelIndent's seven spaces. */
export const indent = (label: string) => '       ' + label;

/** The class list, change mark and revert menu every setting row shares. */
export function itemBase(app: WindowModel, it: Item) {
  const pkey = 'pkey' in it ? it.pkey : undefined;
  const ovrRow = 'ovrRow' in it && !!it.ovrRow;
  const ovr = 'ovr' in it && !!it.ovr;
  const mark = 'mark' in it && !!it.mark;
  const hl = app.st.hl !== null && (pkey ?? ('sid' in it ? it.sid : undefined)) === app.st.hl;
  const cls =
    `it it-${it.k}` + (it.dis ? ' dis' : '') + (hl ? ' hl' : '') + (ovrRow ? ' ovr' + (ovr ? '' : ' fol') : '');
  const markStyle: CSSProperties = { background: it.dis ? rgba(it.acc, 0.4) : it.acc };
  let onContextMenu: ((e: MouseEvent<HTMLElement>) => void) | undefined;
  if (pkey) {
    const srcPage = 'srcPage' in it ? (it.srcPage ?? 'Overview') : 'Overview';
    onContextMenu = (e) =>
      app.openMenu(
        e,
        [
          {
            label: ovrRow ? `Follow the ${pageInfo(srcPage).label} Page` : 'Revert to Default',
            disabled: !mark || it.dis,
          },
        ],
        () => {
          if (ovrRow) app.update((s) => ({ ovr: { ...s.ovr, [pkey]: false } }));
          else app.revert(pkey);
        },
      );
  }
  return { cls, mark, markStyle, hl, onContextMenu, live: !it.dis && (!ovrRow || ovr) };
}
