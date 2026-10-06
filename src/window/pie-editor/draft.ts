// The pie editor's draft: a copy of one menu's title and eight slots, edited freely and never saved.
// Mirrors the plugin's PieMenuDef / PieItemDef, with Blendon's actions read from the Scene view's own
// catalog so the editor and the live pie can't disagree.
import { ActionCatalog } from '../../scene/blendon/piemenus/actions.ts';
import { BuiltInPies } from '../../scene/blendon/piemenus/built-in-pies.ts';
import { PieMenuData } from '../../scene/blendon/piemenus/model.ts';

export interface SlotDraft {
  /** A Blendon action id or a Unity main-menu path; empty for an empty slot. */
  target: string;
  /** Rename override; empty means the action's own name. */
  label: string;
  icon: string;
}

export interface PieDraft {
  title: string;
  items: SlotDraft[];
}

export const emptySlot = (): SlotDraft => ({ target: '', label: '', icon: '' });

/** Every direction is a row, so a shorter list is padded to the full ring. */
function padded(items: SlotDraft[]) {
  const out = items.slice(0, PieMenuData.MaxItems);
  while (out.length < PieMenuData.MaxItems) out.push(emptySlot());
  return out;
}

export const builtInDef = (shortcutId: string) => BuiltInPies.find((p) => p.shortcutId === shortcutId) ?? null;

/** The menu as Blendon ships it; a custom menu (no def) starts empty and untitled. */
export function defaultDraft(shortcutId: string | null): PieDraft {
  const def = shortcutId ? builtInDef(shortcutId) : null;
  return {
    title: def?.title ?? '',
    items: padded((def?.items ?? []).map(([target, icon]) => ({ target, label: '', icon }))),
  };
}

export const cloneSlot = (s: SlotDraft): SlotDraft => ({ ...s });

// ---- names ----

export const leafOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** What a slot is called with no rename: the action's live name, or the menu command's leaf. */
export function naturalName(target: string) {
  if (!target) return '';
  return ActionCatalog.find(target)?.createItem(null).label ?? leafOf(target);
}

export const slotLabel = (s: SlotDraft) => s.label || naturalName(s.target);

// ---- the action tree ----

export interface ActionLeaf {
  path: string;
  name: string;
  icon: string;
}

export interface ActionBranch {
  name: string;
  children: (ActionBranch | ActionLeaf)[];
}

export const isLeaf = (n: ActionBranch | ActionLeaf): n is ActionLeaf => 'path' in n;

// A sample of Unity 6's main menu: what a custom slot can point at besides Blendon's own actions.
const MenuCommands = [
  'Edit/Undo',
  'Edit/Redo',
  'Edit/Select All',
  'Edit/Deselect All',
  'Edit/Select Children',
  'Edit/Invert Selection',
  'Edit/Cut',
  'Edit/Copy',
  'Edit/Paste',
  'Edit/Duplicate',
  'Edit/Rename',
  'Edit/Delete',
  'Edit/Frame Selected',
  'Edit/Lock View to Selected',
  'Edit/Play',
  'Edit/Pause',
  'Edit/Project Settings...',
  'Assets/Create/Folder',
  'Assets/Create/Material',
  'Assets/Create/Prefab',
  'Assets/Show in Explorer',
  'Assets/Refresh',
  'GameObject/Create Empty',
  'GameObject/Create Empty Child',
  'GameObject/3D Object/Cube',
  'GameObject/3D Object/Sphere',
  'GameObject/3D Object/Capsule',
  'GameObject/3D Object/Cylinder',
  'GameObject/3D Object/Plane',
  'GameObject/3D Object/Quad',
  'GameObject/Light/Directional Light',
  'GameObject/Light/Point Light',
  'GameObject/Light/Spot Light',
  'GameObject/Camera',
  'GameObject/Move To View',
  'GameObject/Align With View',
  'GameObject/Align View to Selected',
  'GameObject/Toggle Active State',
  'Component/Physics/Box Collider',
  'Component/Effects/Particle System',
  'Window/General/Scene',
  'Window/General/Game',
  'Window/General/Inspector',
  'Window/General/Hierarchy',
  'Window/General/Project',
  'Window/General/Console',
  'Window/Search/New Window',
];

function insert(root: ActionBranch, path: string, icon: string) {
  const parts = path.split('/');
  let node = root;
  for (const part of parts.slice(0, -1)) {
    let next = node.children.find((c): c is ActionBranch => !isLeaf(c) && c.name === part);
    if (!next) node.children.push((next = { name: part, children: [] }));
    node = next;
  }
  node.children.push({ path, name: parts[parts.length - 1], icon });
}

/** Blendon's actions pinned first, then the main menu, as the plugin's action picker lists them. */
export function actionTree(): ActionBranch {
  const root: ActionBranch = { name: '', children: [] };
  for (const a of ActionCatalog.all()) insert(root, a.id, a.iconName);
  for (const path of MenuCommands) insert(root, path, guessIcon(path));
  return root;
}

export function actionLeaves(node: ActionBranch = actionTree()): ActionLeaf[] {
  return node.children.flatMap((c) => (isLeaf(c) ? [c] : actionLeaves(c)));
}

/** Picking an action resets the rename and takes the action's own icon (PieMenuEditorWindow.Assign). */
export function assign(path: string): SlotDraft {
  const action = ActionCatalog.find(path);
  return { target: path, label: '', icon: action ? action.iconName : guessIcon(path) };
}

// ---- icons ----

/** The Editor icons the site already ships in public/scene/icons; the picker offers only these. */
export const EditorIcons = [
  'CameraPreview',
  'DotFrame',
  'LockIcon-On',
  'LockIcon',
  'NodeChevronDown',
  'NodeChevronLeft',
  'NodeChevronRight',
  'NodeChevronUp',
  'P4_Local',
  'UnityLogo',
  'd_AngleSnap',
  'd_AvatarPivot',
  'd_BoxCollider_Icon',
  'd_Camera_Icon',
  'd_CreateAddNew',
  'd_Favorite',
  'd_FilterByType',
  'd_FolderOpened_Icon',
  'd_Folder_Icon',
  'd_GameObject_Icon',
  'd_Grid.BoxTool',
  'd_Grid.Default',
  'd_Grid.PickingTool',
  'd_GridAndSnap',
  'd_Keyboard',
  'd_Light_Icon',
  'd_Linked',
  'd_Mesh_Icon',
  'd_MoveTool',
  'd_ParticleSystem_Icon',
  'd_PreMatCube',
  'd_PreMatCylinder',
  'd_PreMatQuad',
  'd_PreMatSphere',
  'd_Prefab_Icon',
  'd_Project',
  'd_RectTool',
  'd_Refresh',
  'd_RotateTool',
  'd_SaveAs',
  'd_ScaleSnap',
  'd_ScaleTool',
  'd_SceneViewAudio',
  'd_SceneViewCamera',
  'd_SceneViewFx',
  'd_SceneViewLighting',
  'd_SceneViewOrtho',
  'd_SceneViewSnap',
  'd_SceneViewVisibility',
  'd_Search_Icon',
  'd_Settings',
  'd_SettingsIcon',
  'd_Shaded',
  'd_ShadedWireframe',
  'd_SnapIncrement',
  'd_ToolHandleCenter',
  'd_ToolHandleGlobal',
  'd_ToolHandleLocal',
  'd_ToolHandlePivot',
  'd_Toolbar_Plus',
  'd_TransformTool',
  'd_Transform_Icon',
  'd_TreeEditor.Duplicate',
  'd_TreeEditor.Trash',
  'd_UndoHistory',
  'd_UnityEditor.InspectorWindow',
  'd_UnityEditor.SceneHierarchyWindow',
  'd_UnityEditor.SceneView',
  'd_Unlinked',
  'd_UnlitMode',
  'd_ViewToolMove',
  'd_ViewToolOrbit',
  'd_ViewToolZoom',
  'd__Menu',
  'd_editicon.sml',
  'd_scenepicking_notpickable',
  'd_scenepicking_pickable',
  'd_scenevis_hidden-mixed',
  'd_scenevis_hidden',
  'd_scenevis_visible',
  'd_wireframe',
];

/** File names spell spaces as underscores; both spellings name the same icon. */
export const iconKey = (name: string) => name.replace(/@2x$/, '').replace(/ /g, '_');

export const hasIcon = (name: string) => !!name && EditorIcons.includes(iconKey(name));

/** The picker's hover name: Unity's own spelling, without the dark-skin prefix. */
export const iconTitle = (name: string) => iconKey(name).replace(/^d_/, '').replace(/_/g, ' ');

// MenuCommandCatalog.IconGuesses, narrowed to the icons shipped here.
const IconGuesses: [string, string][] = [
  ['Duplicate', 'd_TreeEditor.Duplicate'],
  ['Delete', 'd_TreeEditor.Trash'],
  ['Undo', 'd_UndoHistory'],
  ['Redo', 'd_UndoHistory'],
  ['Rename', 'd_editicon.sml'],
  ['Frame', 'd_ViewToolZoom'],
  ['Lock', 'LockIcon-On'],
  ['Empty', 'd_GameObject_Icon'],
  ['Capsule', 'd_Mesh_Icon'],
  ['Quad', 'd_PreMatQuad'],
  ['Light', 'd_Light_Icon'],
  ['Particle', 'd_ParticleSystem_Icon'],
  ['Collider', 'd_BoxCollider_Icon'],
  ['Inspector', 'd_UnityEditor.InspectorWindow'],
  ['Hierarchy', 'd_UnityEditor.SceneHierarchyWindow'],
  ['Scene', 'd_UnityEditor.SceneView'],
  ['Game', 'd_SceneViewCamera'],
  ['Search', 'd_Search_Icon'],
  ['Settings', 'd_Settings'],
  ['Explorer', 'd_FolderOpened_Icon'],
  ['Align', 'd_SceneViewCamera'],
  ['View', 'd_SceneViewCamera'],
  ['Active', 'd_scenevis_visible'],
  ['Select', 'd_Grid.BoxTool'],
];

/** MenuCommandCatalog.GuessIcon: a keyword first, then an icon named after the command's leaf. */
export function guessIcon(path: string) {
  const leaf = leafOf(path);
  const byKeyword = (text: string) =>
    IconGuesses.find(([word]) => text.toLowerCase().includes(word.toLowerCase()))?.[1] ?? '';
  const byName = (word: string) =>
    word.length < 3 ? '' : (EditorIcons.find((n) => iconTitle(n).toLowerCase().includes(word.toLowerCase())) ?? '');
  return byKeyword(leaf) || byName(leaf) || leaf.split(' ').map(byName).find(Boolean) || byKeyword(path);
}
