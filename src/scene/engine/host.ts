// Runs a Scene view the way the Editor does: DOM input becomes IMGUI events, each preceded by a
// Layout pass and offered to the Shortcut Manager first; frames run only while something changes.
import { SceneRenderer, type OutlineSets } from '../render/renderer.ts';
import {
  EditorApplication,
  heldModifiers,
  Selection,
  ShortcutManager,
  Undo,
  eventShortcutModifiers,
} from '../unity/editor.ts';
import { EditorGUIUtility, GUI, HandleUtility, SceneViewRef, setDrawTarget } from '../unity/handles.ts';
import { Event, EventModifiers, EventType, GUIUtility, IS_MAC, KeyCode, keyCodeFromDom } from '../unity/imgui.ts';
import { Rect, Vector2 } from '../unity/math.ts';
import { objectsInRect, raycastScene } from '../unity/raycast.ts';
import { Scene, type GameObject } from '../unity/scene.ts';
import { SceneView } from '../unity/sceneview.ts';
import { UnitySelection } from './unity-selection.ts';

/** Unity's mouse button numbering from the DOM's (middle and right swap). */
const UNITY_BUTTON = [0, 2, 1, 3, 4];

const MODIFIER_CODES = new Set<number>([
  KeyCode.LeftShift,
  KeyCode.RightShift,
  KeyCode.LeftControl,
  KeyCode.RightControl,
  KeyCode.LeftAlt,
  KeyCode.RightAlt,
  KeyCode.LeftCommand,
  KeyCode.RightCommand,
]);

export interface HostListeners {
  /** Keyboard capture switched on or off. */
  onActiveChange?(active: boolean): void;
  /** A key or button went down while active, for the key display. */
  onInput?(ev: Event): void;
  /** After every frame, for UI that mirrors engine state. */
  onFrame?(): void;
}

export class SceneHost {
  readonly scene = new Scene();
  readonly view = new SceneView();

  /** The selection's names, for the end-to-end tests. */
  get selectionNames() {
    return Selection.objects.map((o) => o.name);
  }
  readonly renderer: SceneRenderer;
  readonly glCanvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly unitySelection = new UnitySelection(this);
  private readonly cleanup: (() => void)[] = [];
  private raf = 0;
  private lastFrame = 0;
  private dirty = true;
  private inView = true;
  private destroyed = false;
  private pressed = new Set<number>();
  private lastMouse: Vector2 | null = null;
  private dpr = 1;
  active = false;
  listeners: HostListeners = {};
  /** Called after every frame, for overlays that mirror the view. */
  readonly frameListeners = new Set<() => void>();
  /** Where the canvases live and the mouse is read. */
  readonly root: HTMLElement;
  /** What holds keyboard focus: the whole frame, overlays included. */
  readonly focusRoot: HTMLElement;

  constructor(root: HTMLElement, focusRoot: HTMLElement = root) {
    this.root = root;
    this.focusRoot = focusRoot;
    this.glCanvas = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    for (const c of [this.glCanvas, this.overlay]) {
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      root.appendChild(c);
    }
    this.overlay.style.pointerEvents = 'none';
    this.ctx = this.overlay.getContext('2d')!;
    this.renderer = new SceneRenderer(this.glCanvas, this.scene);
    SceneViewRef.current = this.view;
    Scene.current = this.scene;
    this.view.onRepaint = () => this.requestFrame();
    this.view.captureIds = (objects) => this.renderer.captureIds(this.view, objects);
    EditorApplication.wake = () => this.requestFrame();
    Undo.init(this.scene);
    HandleUtility.picker = {
      pick: (gui, ignore) =>
        raycastScene(this.scene, HandleUtility.guiPointToWorldRay(gui), { ignore: ignore as Set<GameObject> })
          ?.gameObject ?? null,
      pickRect: (rect) => objectsInRect(this.scene, rect, (p) => HandleUtility.worldToGUIPointWithDepth(p)),
    };
    this.cleanup.push(this.scene.onChange(() => this.requestFrame()));
    this.cleanup.push(this.scene.onHierarchyChange(() => this.requestFrame()));
    this.bindInput();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(root);
    this.cleanup.push(() => ro.disconnect());
    const io = new IntersectionObserver(([e]) => {
      this.inView = e.isIntersecting;
      if (this.inView) this.requestFrame();
    });
    io.observe(root);
    this.cleanup.push(() => io.disconnect());
    this.resize();
  }

  dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanup) c();
    this.renderer.dispose();
    this.glCanvas.remove();
    this.overlay.remove();
  }

  // ---- frames ------------------------------------------------------------------------------------

  requestFrame() {
    this.dirty = true;
    if (this.raf || this.destroyed || !this.inView) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    this.raf = 0;
    const dt = this.lastFrame ? Math.min(0.1, (t - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = t;
    this.dirty = false;
    EditorApplication.tick();
    const animating = this.view.tick(dt);
    this.repaint();
    this.listeners.onFrame?.();
    for (const f of this.frameListeners) f();
    if (this.dirty || animating || EditorApplication.busy) this.requestFrame();
    else this.lastFrame = 0;
  }

  private resize() {
    const r = this.root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)),
      h = Math.max(1, Math.round(r.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.view.position = new Rect(0, 0, w, h);
    this.view.pixelsPerPoint = this.dpr;
    this.view.updateCamera();
    this.renderer.setSize(w, h, this.dpr);
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.requestFrame();
  }

  /** Unity outlines the selection, and in a second colour whatever hangs below it. */
  private outlineSets(): OutlineSets {
    const selected = Selection.objects;
    const sel = new Set(selected);
    const children: GameObject[] = [];
    for (const go of selected)
      for (const t of go.transform.walk()) if (!sel.has(t.gameObject)) children.push(t.gameObject);
    return {
      selected: selected.filter((o) => o.mesh),
      children: children.filter((o) => o.mesh),
      highlight: this.view.highlight,
    };
  }

  private repaint() {
    this.renderer.render(this.view, this.outlineSets());
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ev = new Event(EventType.Repaint);
    ev.mousePosition = this.lastMouse ?? Vector2.zero;
    ev.modifiers = this.currentModifiers();
    this.runPass(ev);
    this.drawNotification(ctx);
  }

  /** SceneView.ShowNotification: centred, fading out over its last half second. */
  private drawNotification(ctx: CanvasRenderingContext2D) {
    const n = this.view.notification;
    if (!n) return;
    const left = n.until - performance.now() / 1000;
    if (left <= 0) {
      this.view.notification = null;
      return;
    }
    const a = Math.min(1, left / 0.5);
    ctx.save();
    ctx.font = '600 20px Inter, system-ui, sans-serif';
    const w = ctx.measureText(n.text).width + 40;
    const r = this.view.position;
    const x = (r.width - w) / 2,
      y = r.height / 2 - 24;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(30,30,30,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, 48, 6);
    ctx.fill();
    ctx.fillStyle = '#e6e6e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.text, r.width / 2, y + 24);
    ctx.restore();
    this.requestFrame();
  }

  // ---- passes ------------------------------------------------------------------------------------

  /** One IMGUI event: Layout first, then the event itself, through every Scene view hook. */
  runPass(ev: Event) {
    const view = this.view;
    // Reentrant: a command can be sent from inside another event's pass.
    const outer = {
      ev: Event.current,
      id: GUIUtility.nextId,
      near: HandleUtility.nearestControl,
      nested: this.depth > 0,
    };
    this.depth++;
    SceneView.currentDrawingSceneView = view;
    setDrawTarget({ ctx: this.ctx, view });
    if (!outer.nested) EditorGUIUtility.cursor = '';
    try {
      const layout = ev.clone(EventType.Layout);
      Event.current = layout;
      GUIUtility.beginPass();
      HandleUtility.beginLayout();
      this.hooks(view);
      HandleUtility.endLayout();

      Event.current = ev;
      GUIUtility.beginPass();
      GUI.changed = false;
      this.hooks(view);
    } finally {
      this.depth--;
      if (outer.nested) {
        Event.current = outer.ev;
        GUIUtility.nextId = outer.id;
        HandleUtility.nearestControl = outer.near;
      } else {
        setDrawTarget(null);
        SceneView.currentDrawingSceneView = null;
      }
    }
    if (!outer.nested) this.root.style.cursor = EditorGUIUtility.cursor || '';
    return ev;
  }

  private depth = 0;

  private hooks(view: SceneView) {
    SceneView.beforeSceneGui.invoke(view);
    this.unitySelection.onGUI(view);
    SceneView.duringSceneGui.invoke(view);
  }

  // ---- input -------------------------------------------------------------------------------------

  private currentModifiers() {
    let m = 0;
    if (heldModifiers.shift) m |= EventModifiers.Shift;
    if (heldModifiers.control) m |= EventModifiers.Control;
    if (heldModifiers.alt) m |= EventModifiers.Alt;
    if (heldModifiers.command) m |= EventModifiers.Command;
    return m;
  }

  private syncModifiers(e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) {
    heldModifiers.shift = e.shiftKey;
    heldModifiers.control = e.ctrlKey;
    heldModifiers.alt = e.altKey;
    heldModifiers.command = e.metaKey;
    heldModifiers.action = IS_MAC ? e.metaKey : e.ctrlKey;
  }

  private guiPoint(e: { clientX: number; clientY: number }) {
    const r = this.root.getBoundingClientRect();
    return new Vector2(e.clientX - r.left, e.clientY - r.top);
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!on) this.releaseAll();
    this.listeners.onActiveChange?.(on);
    this.requestFrame();
  }

  /** What the Editor does when it loses focus: clutches end, drags are dropped. */
  private releaseAll() {
    ShortcutManager.releaseAll(this.view);
    for (const b of [...this.pressed]) {
      const ev = new Event(EventType.MouseUp);
      ev.button = b;
      ev.mousePosition = this.lastMouse ?? Vector2.zero;
      this.runPass(ev);
    }
    this.pressed.clear();
    heldModifiers.shift =
      heldModifiers.control =
      heldModifiers.alt =
      heldModifiers.command =
      heldModifiers.action =
        false;
    EditorApplication.focusChanged.invoke(false);
    if (GUIUtility.hotControl !== 0) GUIUtility.hotControl = 0;
  }

  private mouseEvent(type: EventType, e: PointerEvent | MouseEvent, button: number) {
    const ev = new Event(type);
    ev.button = button;
    ev.mousePosition = this.guiPoint(e);
    ev.delta = this.lastMouse ? ev.mousePosition.sub(this.lastMouse) : Vector2.zero;
    ev.modifiers = this.currentModifiers();
    ev.clickCount = e.detail || 1;
    return ev;
  }

  /** Offers a mouse press to the Shortcut Manager: clutches see it and pass it on, actions take it. */
  private mouseShortcut(button: number, ev: Event, down: boolean) {
    const keyCode = KeyCode.Mouse0 + button;
    if (!down) return ShortcutManager.dispatchUp(keyCode, this.view) && false;
    const entry = ShortcutManager.find(keyCode, eventShortcutModifiers(ev));
    if (!entry) return false;
    const k = new Event(EventType.KeyDown);
    k.keyCode = keyCode;
    k.modifiers = ev.modifiers;
    ShortcutManager.dispatchDown(k, this.view);
    return !entry.clutch;
  }

  private bindInput() {
    const root = this.root;
    const focusRoot = this.focusRoot;
    focusRoot.tabIndex = 0;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(root, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      focusRoot.focus({ preventScroll: true });
      this.setActive(true);
      this.syncModifiers(e);
      root.setPointerCapture(e.pointerId);
      this.press(e, UNITY_BUTTON[e.button] ?? e.button);
      this.requestFrame();
    });

    on(root, 'pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.syncModifiers(e);
      const events = e.getCoalescedEvents?.() ?? [e];
      for (const ce of events.length ? events : [e]) {
        // Bit n of `buttons` is Unity's button n. A press or release while another button is held (a
        // chord) only comes as a move, and a button released outside the page never reported its up.
        for (const b of [...this.pressed]) if (!(ce.buttons & (1 << b))) this.release(ce, b);
        if (this.pressed.size > 0)
          for (let b = 0; b < 5; b++) if (ce.buttons & (1 << b) && !this.pressed.has(b)) this.press(ce, b);
        const held = [...this.pressed];
        const type = held.length ? EventType.MouseDrag : EventType.MouseMove;
        const ev = this.mouseEvent(type, ce, held.length ? held[held.length - 1] : 0);
        this.lastMouse = ev.mousePosition;
        if (type === EventType.MouseMove && !this.active) continue;
        this.runPass(ev);
      }
      this.requestFrame();
    });

    on(root, 'pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.syncModifiers(e);
      this.release(e, UNITY_BUTTON[e.button] ?? e.button);
    });

    on(root, 'pointercancel', () => this.releaseAll());
    on(root, 'contextmenu', (e) => e.preventDefault());
    // Back/forward buttons would navigate the page away.
    on(root, 'auxclick', (e) => e.preventDefault());
    on(root, 'mouseup', (e) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    });

    on(
      root,
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.syncModifiers(e);
        const ev = new Event(EventType.ScrollWheel);
        ev.mousePosition = this.guiPoint(e);
        ev.modifiers = this.currentModifiers();
        // The Editor reports a wheel notch as 3 lines.
        const k = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? 30 : 3 / 100;
        ev.delta = new Vector2(e.deltaX * k, e.deltaY * k);
        this.runPass(ev);
        this.requestFrame();
      },
      { passive: false },
    );

    // A text field on the view (the context menu's search) types; the view gets nothing of it.
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    on(focusRoot, 'keydown', (e) => {
      if (!this.active || typing(e)) return;
      this.syncModifiers(e);
      const ev = this.keyEvent(EventType.KeyDown, e);
      if (passThrough(e)) return;
      e.preventDefault();
      if (ev.keyCode === KeyCode.None) return;
      this.listeners.onInput?.(ev);
      if (MODIFIER_CODES.has(ev.keyCode)) this.endStaleClutches(ev);
      if (
        !MODIFIER_CODES.has(ev.keyCode) &&
        GUIUtility.keyboardControl === 0 &&
        ShortcutManager.dispatchDown(ev, this.view)
      ) {
        this.requestFrame();
        return;
      }
      this.runPass(ev);
      this.requestFrame();
    });

    on(focusRoot, 'keyup', (e) => {
      if (!this.active || typing(e)) return;
      this.syncModifiers(e);
      const ev = this.keyEvent(EventType.KeyUp, e);
      if (ev.keyCode === KeyCode.None) return;
      e.preventDefault();
      if (MODIFIER_CODES.has(ev.keyCode)) this.endStaleClutches(ev);
      if (ShortcutManager.dispatchUp(ev.keyCode, this.view)) {
        this.requestFrame();
        return;
      }
      this.runPass(ev);
      this.requestFrame();
    });

    on(focusRoot, 'focusin', () => this.setActive(true));
    on(focusRoot, 'focusout', (e) => {
      if (!focusRoot.contains(e.relatedTarget as Node | null)) this.setActive(false);
    });
    on(window, 'blur', () => this.setActive(false));
  }

  private press(e: PointerEvent, button: number) {
    if (this.pressed.has(button)) return;
    this.pressed.add(button);
    const ev = this.mouseEvent(EventType.MouseDown, e, button);
    this.lastMouse = ev.mousePosition;
    this.listeners.onInput?.(ev);
    if (!this.mouseShortcut(button, ev, true)) this.runPass(ev);
  }

  private release(e: PointerEvent | MouseEvent, button: number) {
    if (!this.pressed.has(button)) return;
    this.pressed.delete(button);
    const ev = this.mouseEvent(EventType.MouseUp, e, button);
    this.lastMouse = ev.mousePosition;
    this.mouseShortcut(button, ev, false);
    this.runPass(ev);
    this.requestFrame();
  }

  private keyEvent(type: EventType, e: KeyboardEvent) {
    const ev = new Event(type);
    ev.keyCode = keyCodeFromDom(e.code, e.key);
    ev.character = e.key.length === 1 ? e.key : '';
    ev.modifiers = this.currentModifiers();
    if (e.code.startsWith('Numpad')) ev.modifiers |= EventModifiers.Numeric;
    ev.isRepeat = e.repeat;
    ev.mousePosition = this.lastMouse ?? Vector2.zero;
    return ev;
  }

  /** The Editor ends a clutch once the held modifiers stop matching its binding. */
  private endStaleClutches(ev: Event) {
    ShortcutManager.endMismatched(eventShortcutModifiers(ev), this.view);
  }
}

/** Browser keys left alone even while the view has the keyboard. */
function passThrough(e: KeyboardEvent) {
  if (/^F\d+$/.test(e.key)) return true;
  if ((e.ctrlKey || e.metaKey) && /^[rltwnjip0=+-]$/i.test(e.key) && e.key.toLowerCase() !== 'z') return true;
  if (e.key === 'Tab') return true;
  return false;
}
