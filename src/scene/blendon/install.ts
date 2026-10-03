// Installs every Blendon feature into the running Scene view, in the order their scene GUI hooks
// subscribe (which is the order they see each event).
import { OrbitSelected } from './navigation/orbit-selected.ts';
import { Pan } from './navigation/pan.ts';
import { QuickRoll } from './navigation/quick-roll.ts';
import { ViewportNav } from './navigation/viewport-nav.ts';
import { Zoom } from './navigation/zoom.ts';

let installed = false;

export function installBlendon() {
  if (installed) return;
  installed = true;
  OrbitSelected.install();
  QuickRoll.install();
  Pan.install();
  Zoom.install();
  ViewportNav.install();
}
