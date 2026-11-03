// ViewportGesture: the two questions every Scene view shortcut asks before it acts.
import { EventModifiers, Event, EventType, IS_MAC } from '../../unity/imgui.ts';
import { ShortcutManager, ShortcutModifiers, type KeyCombination } from '../../unity/editor.ts';
import type { Vector2 } from '../../unity/math.ts';
import type { GameObject } from '../../unity/scene.ts';
import { ModalViewportGate } from '../foundation.ts';

/** Filled in by GizmoController: the modal grab owning the view, if any. */
export const GizmoRegistry = {
  modalKey: null as null | ((ev: Event) => boolean),
  hasModalSession: () => false,
  anyManipulation: () => false,
};

function toEventModifiers(m: number) {
  let r = 0;
  if (m & ShortcutModifiers.Shift) r |= EventModifiers.Shift;
  if (m & ShortcutModifiers.Alt) r |= EventModifiers.Alt;
  if (m & ShortcutModifiers.Control) r |= EventModifiers.Control;
  if (m & ShortcutModifiers.Action) r |= IS_MAC ? EventModifiers.Command : EventModifiers.Control;
  return r;
}

export const ViewportGesture = {
  /** A pie menu or a modal grab owns the view. */
  get busy() {
    return ModalViewportGate.isBlocked || GizmoRegistry.hasModalSession();
  },

  /** Filled in by ClickSelectParent: what a still click on a gizmo handle selects instead, if it walks up. */
  handleClickWalk: (() => null) as (position: Vector2) => GameObject[] | null,

  /** Offers this shortcut's keys to a running grab; true when the grab took them. */
  claimed(shortcutId: string) {
    return ViewportGesture.tryHandleModalKey(ShortcutManager.getShortcutBinding(shortcutId));
  },

  tryHandleModalKey(combo: KeyCombination | null) {
    if (!combo || !GizmoRegistry.modalKey || !GizmoRegistry.hasModalSession()) return false;
    const ev = new Event(EventType.KeyDown);
    ev.keyCode = combo.keyCode;
    ev.modifiers = toEventModifiers(combo.modifiers);
    return GizmoRegistry.modalKey(ev);
  },
};
