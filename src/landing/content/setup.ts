// The Setup section's carousel of settings pages.
import slideOverview from '../../assets/landing/slides/overview.jpg';
import slideKeyboard from '../../assets/landing/slides/keyboard.jpg';
import slideOrbitSelected from '../../assets/landing/slides/orbit-selected.jpg';
import slideZoom from '../../assets/landing/slides/zoom.jpg';
import slideViewportNav from '../../assets/landing/slides/viewport-nav.jpg';
import slideSharedGizmos from '../../assets/landing/slides/shared-gizmos.jpg';
import slideBoxSelect from '../../assets/landing/slides/box-select.jpg';
import slidePieMenus from '../../assets/landing/slides/pie-menus.jpg';
import slideSceneMenu from '../../assets/landing/slides/scene-menu.jpg';
import slideHistory from '../../assets/landing/slides/history.jpg';

export interface SettingsSlide {
  title: string;
  sub: string;
  desc: string;
  chips: string[];
  image: string;
}

export const SETTINGS_SLIDES: SettingsSlide[] = [
  {
    title: 'Blendon',
    sub: 'What Blendon does, what is switched on, and the keys it answers to',
    desc: 'The start page: a master switch, three feature presets that only switch features, and the keyboard preset that decides who keeps a contested key, with the clashes listed side by side.',
    chips: ['Master switch', 'Full · Essentials · Tools Only', 'Blendon / Unity keys'],
    image: slideOverview,
  },
  {
    title: 'Keyboard',
    sub: 'Every key Blendon answers to, in one table',
    desc: "Grouped by feature. Each row shares its binding with the feature's own page, so changing one changes both. A row's restore button puts back the keyboard preset's key, and selecting Default in Edit → Shortcuts undoes every key change at once.",
    chips: ['Rebind', 'Restore preset key', 'Clear', 'Open feature page'],
    image: slideKeyboard,
  },
  {
    title: 'Orbit Selected',
    sub: "Turn the camera around whatever is selected, not the Scene View's pivot",
    desc: 'With Depth on, orbiting with nothing selected turns around the surface under the cursor.',
    chips: ['Depth', 'Show Pivot Dot', 'Sensitivity', 'Snap view to world axis', 'Quick Roll'],
    image: slideOrbitSelected,
  },
  {
    title: 'Zoom',
    sub: 'Wheel and keyboard zoom toward the cursor, not the centre',
    desc: 'Scale zooms in even steps, Dolly flies the camera in, Continue zooms further the faster you roll. Zoom To picks what stays put: the point under the cursor, the selection or the middle of the view.',
    chips: ['Method', 'Zoom To', 'Invert Direction', 'Sensitivity', 'Keyboard Zoom'],
    image: slideZoom,
  },
  {
    title: 'Numpad Views',
    sub: "Blender's numpad: axis views, stepped orbit, projection toggle",
    desc: 'Axis keys send the view to a fixed angle around the pivot, and a second press returns to the perspective view you left. Orbit keys turn it one step at a time, around the selection wherever Orbit Selected works. Animate flies to each view instead of cutting.',
    chips: ['Animate', 'Axis Views', 'Orbit Steps', 'Toggle Perspective'],
    image: slideViewportNav,
  },
  {
    title: 'All Tools',
    sub: 'Settings the four tools below share: size, snapping, precision, readouts',
    desc: "One switch for all four transform gizmos and the drag settings they share. Each tool's page multiplies or overrides what it needs.",
    chips: ['Blender · Unity+', 'Pivot Point Menu', 'Vertex Snapping', 'Precision Mode'],
    image: slideSharedGizmos,
  },
  {
    title: 'Box Select',
    sub: 'Drag a box that selects everything it touches, not just what fits inside it',
    desc: "The box is tested against real shapes, so a long diagonal object counts only where the box crosses it. Visible Only skips objects hidden behind others. Switch Box Select off to give the drag back to the Editor's box.",
    chips: ['Select Prefab Roots', 'Visible Only', 'Click Selects Parent', 'Hierarchy Keys'],
    image: slideBoxSelect,
  },
  {
    title: 'Pie Menus',
    sub: 'Radial menus you hold a key to open: the shipped ones and your own',
    desc: 'How every pie behaves: how far a flick must travel, how long a tap may last, whether items show numbers. Add up to eight pies of your own.',
    chips: ['Deadzone', 'Tap Timeout', 'Show Numbers', 'Place On Floor'],
    image: slidePieMenus,
  },
  {
    title: 'Context Menu',
    sub: "Right-click the Scene View for a grouped, searchable menu with every entry Unity's has",
    desc: "Entries show their keys. The Extra Entries table adds Blendon's actions. A right-click drag still flies through the scene.",
    chips: ['Edit Actions', 'Search Field', 'Classic Menu Row', 'Extra Entries'],
    image: slideSceneMenu,
  },
  {
    title: 'Navigation History',
    sub: 'Step back and forward through selections and camera positions',
    desc: 'Selection History and View History, each with its own switch. Both step back and forward on the mouse side buttons, keep up to 100 steps and start a fresh trail when you pick something new after going back.',
    chips: ['Selection History', 'View History', 'Back / Forward', 'Animate'],
    image: slideHistory,
  },
];
