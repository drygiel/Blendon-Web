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
    desc: "The start page. A master switch, three feature presets and the keyboard preset that decides who keeps a contested key. Clashes are listed side by side: Blendon keeps Grab on G, and Unity's Cycle Tool Modes moves to Shift + G.",
    chips: ['Master switch', 'Full · Essentials · Tools Only', 'Blendon / Unity keys'],
    image: slideOverview,
  },
  {
    title: 'Keyboard',
    sub: 'Every key Blendon answers to, in one table',
    desc: "Every shortcut Blendon declares, grouped by feature. Change one here and the feature's own page changes with it, because one binding sits behind both rows. Selecting Default in Edit → Shortcuts undoes every key change at once.",
    chips: ['Rebind', 'Reset one key', 'Clear', 'Open feature page'],
    image: slideKeyboard,
  },
  {
    title: 'Orbit Selected',
    sub: "Turn the camera around whatever is selected, not the Scene View's pivot",
    desc: 'Each feature page opens with an illustrated card: how it works, what to know, every key. Below it sits the tuning. With Depth on, orbiting with nothing selected turns around the surface under the cursor.',
    chips: ['Depth', 'Show Pivot Dot', 'Sensitivity', 'Snap View to World Axis', 'Quick Roll'],
    image: slideOrbitSelected,
  },
  {
    title: 'Zoom',
    sub: 'Wheel and keyboard zoom that moves toward the cursor rather than the centre',
    desc: 'Pick how the wheel zooms: Scale in even steps, Dolly flies the camera in, Continue zooms further the faster you roll. With Zoom To Cursor, the point under the cursor stays where it is.',
    chips: ['Method', 'Zoom To Cursor', 'Invert Direction', 'Sensitivity', 'Keyboard Zoom'],
    image: slideZoom,
  },
  {
    title: 'Numpad Views',
    sub: "Blender's numpad: axis views, stepped orbit, projection toggle",
    desc: 'Each keypad key sends the view to a fixed angle around the pivot, and the same key always lands on the same view. With Orbit Selected on, the steps turn around the selection. Animate flies to each view instead of cutting.',
    chips: ['Animate', 'Axis views', 'Orbit steps', 'Toggle Projection'],
    image: slideViewportNav,
  },
  {
    title: 'All Tools',
    sub: 'Settings the four tools below share - size, snapping, precision, readouts',
    desc: "One switch for all four transform gizmos and everything a drag shares: the ghost of where it started, the constraint line, snap ticks and the live readout. Each tool's own page then multiplies or overrides what it needs.",
    chips: ['Blender · Unity+ · Custom', 'Pivot Point Menu', 'Vertex Snapping', 'Precision Mode'],
    image: slideSharedGizmos,
  },
  {
    title: 'Box Select',
    sub: 'Drag a box that selects everything it touches, not just what fits inside it',
    desc: 'The box is tested against real shapes, so a long diagonal object counts only where the box actually crosses it. Visible Only skips what is hidden behind other objects. The feature ships switched off until you turn it on.',
    chips: ['Select Prefab Roots', 'Visible Only', 'Click Selects Parent', 'Hierarchy keys'],
    image: slideBoxSelect,
  },
  {
    title: 'Pie Menus',
    sub: 'Radial menus you hold a key to open - the shipped ones and your own',
    desc: 'One place for how every pie behaves: how far a flick must travel, how long a tap may last, whether items show their numbers. Eight menus ship with Blendon, and you can add up to eight of your own from any Blendon action or Unity menu command.',
    chips: ['Deadzone', 'Tap Timeout', 'Show Numbers', 'Place On Floor'],
    image: slidePieMenus,
  },
  {
    title: 'Context Menu',
    sub: "Right-click the Scene View for a grouped, searchable menu with every entry Unity's has",
    desc: "Every entry of the Editor's own menu, grouped and with its keys, plus a search field: just start typing. The Extra Entries table adds Blendon's own actions, and a right-click that drags still flies through the scene.",
    chips: ['Edit Actions', 'Search Field', 'Classic Menu Row', 'Extra Entries'],
    image: slideSceneMenu,
  },
  {
    title: 'Navigation History',
    sub: 'Step back and forward through selections and camera positions',
    desc: "Selection History and View History, each with its own switch. Both work like a browser's back and forward on the mouse side buttons, keep up to 100 steps, and start a fresh trail when you pick something new after going back.",
    chips: ['Selection History', 'View History', 'Back / Forward', 'Animate'],
    image: slideHistory,
  },
];
