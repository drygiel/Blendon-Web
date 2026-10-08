// ShortcutParking: a switched-off feature's keys are parked, so they go back to the Editor's own
// commands, as if Blendon weren't installed.
import { D } from '../../plugin/window-data.ts';
import { GeneralSettings, sBool } from './settings.ts';

const on = (cls: string) => sBool(cls + '.Enabled', true);
const Tools = ['MoveGizmoSettings', 'RotateGizmoSettings', 'ScaleGizmoSettings', 'TransformGizmoSettings'];

let pageOf: Map<string, string> | null = null;

function live(id: string): boolean {
  if (id === 'Blendon/Quick Roll')
    return on('OrbitSelectedSettings') && sBool('OrbitSelectedSettings.RollEnabled', true);
  if (id.startsWith('Blendon/Zoom/')) return on('ZoomSettings') && sBool('ZoomSettings.KeyboardEnabled', true);
  if (id.startsWith('Blendon/History/')) return on(id.endsWith('View') ? 'ViewHistorySettings' : 'HistorySettings');
  if (id === 'Blendon/Toggle Wireframe') return on('WireframeToggleSettings');
  if (id.startsWith('Blendon/Pie Menus/')) return on('PieMenuSettings');
  pageOf ??= new Map(Object.entries(D.pageShortcuts).flatMap(([page, ids]) => ids.map((i) => [i, page] as const)));
  const page = pageOf.get(id);
  if (page === 'SharedGizmos') return Tools.some(on);
  const owner = page ? D.pageOwner[page] : undefined;
  return owner ? on(owner) : true;
}

export const ShortcutParking = {
  isParked(id: string) {
    if (!id.startsWith('Blendon/')) return false;
    return !GeneralSettings.Enabled || !live(id);
  },
};
