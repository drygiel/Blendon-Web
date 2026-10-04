// PieMenuRenderer + PieMenuStyles: the centre ring, the title and one pill per item, unfolding from the
// spawn point. Draws what the request says; which slot is highlighted was decided by the caller.
import { GUI, EditorGUIUtility } from '../../unity/handles.ts';
import { editorIcon } from '../../unity/icons.ts';
import { Color, Mathf, Rect, Vector2 } from '../../unity/math.ts';
import { brighten, ColorDefaults, withAlpha, withFade } from '../color.ts';
import { GizmoColors } from '../gizmos/colors.ts';
import { ProceduralTextures, type BakedTexture } from '../procedural-textures.ts';
import { PieLayout } from './layout.ts';
import { PieMenuData, RadialDirections, type PieItem } from './model.ts';
import { PieMenuSettings } from './settings.ts';

export const PieMenuStyles = {
  ItemHeight: 24,
  IconSize: 16,
  PaddingLeft: 9,
  PaddingRight: 9,
  IconGap: 6,
  DigitGap: 16,
  MinItemWidth: 72,
  MaxItemWidth: 190,
  CornerRadius: 5,
  RingOuterRadius: 23,
  RingThickness: 9,
  /** In device pixels, not points: a hairline that stays crisp at any display scale. */
  OutlineThickness: 1,
  FontSize: 11,
};

const TitleGap = 4;
const TitleHeight = 16;
const Font = `400 ${PieMenuStyles.FontSize}px Inter, system-ui, sans-serif`;

// GuiFx.ShadowLabel: offsets below the text only, reading as an overhead light rather than a halo.
const ShadowOpacity = 0.1;
const ShadowOffsets = [
  new Vector2(0, 1),
  new Vector2(-1, 1),
  new Vector2(1, 1),
  new Vector2(-1, 0.5),
  new Vector2(1, 0.5),
].map((o) => new Vector2(o.x * 0.5, o.y));

export interface PieRenderRequest {
  data: PieMenuData;
  center: Vector2;
  radius: number;
  unfold: number;
  /** -1 for none. */
  highlighted: number;
  hasWedge: boolean;
  /** Cursor direction from the centre, normalized, GUI space. */
  direction: Vector2;
}

// ---- baked shapes ----

const pills = new Map<string, BakedTexture | null>();
let ring: { key: string; tex: BakedTexture | null } | null = null;
let arc: { key: string; angle: number; tex: BakedTexture | null } | null = null;

const scale = () => EditorGUIUtility.pixelsPerPoint;
const colorKey = (c: Color) => `${c.r},${c.g},${c.b},${c.a}`;

function pill(size: Vector2, fill: Color) {
  const s = scale();
  const w = Math.max(1, Math.round(size.x * s));
  const h = Math.max(1, Math.round(size.y * s));
  const outline = GizmoColors.Outline;
  const key = `${w}x${h}|${s}|${colorKey(fill)}|${colorKey(outline)}`;
  let tex = pills.get(key);
  if (tex === undefined) {
    if (pills.size > 128) pills.clear();
    // Radius scales with the display; the outline deliberately doesn't (see OutlineThickness).
    tex = ProceduralTextures.roundedRect(
      w,
      h,
      PieMenuStyles.CornerRadius * s,
      PieMenuStyles.OutlineThickness,
      fill,
      outline,
    );
    pills.set(key, tex);
  }
  return tex;
}

function ringDiameter() {
  return Math.max(1, Math.round(PieMenuStyles.RingOuterRadius * 2 * scale()));
}

function emptyRing(fill: Color) {
  const key = `${scale()}|${colorKey(fill)}|${colorKey(GizmoColors.Outline)}`;
  if (ring?.key !== key)
    ring = {
      key,
      tex: ProceduralTextures.ring(
        ringDiameter(),
        PieMenuStyles.RingThickness * scale(),
        PieMenuStyles.OutlineThickness,
        fill,
        GizmoColors.Outline,
      ),
    };
  return ring.tex;
}

// Re-baked as the cursor sweeps, but not for a change below 0.1 degree no eye can register.
function ringWithArc(itemCount: number, ringColor: Color, wedgeColor: Color, angle: number) {
  const key = `${scale()}|${itemCount}|${colorKey(ringColor)}|${colorKey(wedgeColor)}|${colorKey(GizmoColors.Outline)}`;
  if (arc?.key !== key || Math.abs(Mathf.DeltaAngle(arc.angle, angle)) >= 0.1)
    arc = {
      key,
      angle,
      tex: ProceduralTextures.ringWithWedge(
        ringDiameter(),
        PieMenuStyles.RingThickness * scale(),
        PieMenuStyles.OutlineThickness,
        ringColor,
        wedgeColor,
        GizmoColors.Outline,
        180 / Math.max(1, itemCount),
        angle,
      ),
    };
  return arc.tex;
}

// ---- text ----

function measure(text: string) {
  return GUI.measure(text, PieMenuStyles.FontSize);
}

/** Label vertically centred in rect, clipped to it. */
function label(rect: Rect, text: string, color: Color, align: CanvasTextAlign) {
  const ctx = GUI.ctx;
  if (!ctx || color.a <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.font = Font;
  ctx.fillStyle = color.css();
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const x = align === 'center' ? rect.x + rect.width / 2 : align === 'right' ? rect.xMax : rect.x;
  ctx.fillText(text, x, rect.y + rect.height / 2 + 0.5);
  ctx.restore();
}

function shadowLabel(rect: Rect, text: string, color: Color, shadowColor: Color, alpha: number) {
  if (!text || alpha <= 0) return;
  const shadow = withFade(shadowColor, ShadowOpacity * alpha);
  if (shadow.a > 0)
    for (const o of ShadowOffsets)
      label(new Rect(rect.x + o.x, rect.y + o.y, rect.width, rect.height), text, shadow, 'center');
  label(rect, text, withFade(color, alpha), 'center');
}

// ---- layout ----

interface SlotLayout {
  pill: Rect;
  icon: Rect | null;
  label: Rect;
  digit: Rect | null;
  accelerator: number;
}

const acceleratorOf = (index: number) => (PieMenuSettings.ShowAccelerators ? PieMenuData.acceleratorOf(index) : 0);

function measureItem(item: PieItem, accelerator: number) {
  const S = PieMenuStyles;
  let w = S.PaddingLeft + S.PaddingRight;
  if (item.iconName) w += S.IconSize + S.IconGap;
  w += measure(item.label);
  if (accelerator > 0) w += S.DigitGap + measure(String(accelerator));
  return new Vector2(Mathf.Clamp(w, S.MinItemWidth, S.MaxItemWidth), S.ItemHeight);
}

function slotLayout(request: PieRenderRequest, index: number, hasIcon: boolean): SlotLayout {
  const S = PieMenuStyles;
  const item = request.data.items[index]!;
  const accelerator = acceleratorOf(index);
  const size = measureItem(item, accelerator);
  const c = PieLayout.itemCenter(request.center, request.data.directionOf(index), size, request.radius, request.unfold);
  const rect = ProceduralTextures.snapToPixelGrid(new Rect(c.x - size.x / 2, c.y - size.y / 2, size.x, size.y));
  let x = rect.x + S.PaddingLeft;
  let icon: Rect | null = null;
  if (hasIcon) {
    icon = new Rect(x, rect.y + (rect.height - S.IconSize) / 2, S.IconSize, S.IconSize);
    x += S.IconSize + S.IconGap;
  }
  const digitWidth = accelerator > 0 ? measure(String(accelerator)) : 0;
  const reserved = accelerator > 0 ? digitWidth + S.DigitGap : 0;
  return {
    pill: rect,
    icon,
    label: new Rect(x, rect.y, rect.xMax - S.PaddingRight - reserved - x, rect.height),
    digit: accelerator > 0 ? new Rect(rect.xMax - S.PaddingRight - digitWidth, rect.y, digitWidth, rect.height) : null,
    accelerator,
  };
}

// ---- drawing ----

function drawRing(request: PieRenderRequest) {
  const s = PieMenuSettings;
  const tex = request.hasWedge
    ? ringWithArc(
        request.data.count,
        s.RingColor,
        s.CurrentColor,
        Math.atan2(request.direction.y, request.direction.x) * Mathf.Rad2Deg,
      )
    : emptyRing(s.RingColor);
  if (!tex) return;
  // The texture's real device-pixel footprint, not the nominal size, so it is never stretched.
  const size = tex.width / scale();
  const rect = ProceduralTextures.snapToPixelGrid(
    new Rect(request.center.x - size / 2, request.center.y - size / 2, size, size),
  );
  GUI.drawTexture(rect, tex, withAlpha(Color.white, request.unfold));
}

function drawTitle(request: PieRenderRequest) {
  const title = request.data.title;
  if (!title) return;
  const rect = new Rect(
    request.center.x - 100,
    request.center.y - PieMenuStyles.RingOuterRadius - TitleGap - TitleHeight,
    200,
    TitleHeight,
  );
  // On bare scene rather than a pill, so the shadow keeps it legible.
  shadowLabel(
    rect,
    title,
    withFade(PieMenuSettings.TextColor, ColorDefaults.PieTitleFade),
    GizmoColors.Outline,
    request.unfold,
  );
}

function drawItem(request: PieRenderRequest, index: number) {
  const s = PieMenuSettings;
  const item = request.data.items[index]!;
  const icon = editorIcon(item.iconName);
  const layout = slotLayout(request, index, !!icon);
  const highlighted = index === request.highlighted;
  const isCurrent = item.isCurrent;
  const enabled = item.isEnabled;
  const fill = isCurrent
    ? highlighted
      ? brighten(s.CurrentColor, ColorDefaults.PieCurrentHoverBoost, 0)
      : s.CurrentColor
    : highlighted
      ? s.HighlightColor
      : s.ItemColor;
  const text = isCurrent || highlighted ? GizmoColors.PieHighlightedText : s.TextColor;
  // A greyed item stays in place: a hole would read worse than a slot that says it's unavailable.
  const alpha = request.unfold * (enabled ? 1 : ColorDefaults.PieDisabledFade);

  const tex = pill(layout.pill.size, fill);
  if (tex) GUI.drawTexture(layout.pill, tex, withAlpha(Color.white, alpha));
  if (icon && layout.icon) GUI.drawTexture(layout.icon, icon, withAlpha(Color.white, alpha));
  label(layout.label, item.label, withFade(text, alpha), 'left');
  if (layout.digit)
    label(layout.digit, String(layout.accelerator), withFade(text, ColorDefaults.PieAcceleratorFade * alpha), 'right');
}

export const PieMenuRenderer = {
  draw(request: PieRenderRequest) {
    drawRing(request);
    drawTitle(request);
    for (let i = 0; i < request.data.count; i++) if (request.data.items[i]) drawItem(request, i);
  },

  /** Ring wedge frozen until the unfold is done, as in Unity. */
  requestFor(c: {
    data: PieMenuData;
    spawnCenter: Vector2;
    unfold: number;
    highlighted: number;
    invalidDirection: boolean;
    pieDirection: Vector2;
  }): PieRenderRequest {
    const direction = RadialDirections.toGui(c.pieDirection);
    return {
      data: c.data,
      center: c.spawnCenter,
      radius: PieMenuSettings.Radius,
      unfold: c.unfold,
      highlighted: c.highlighted,
      hasWedge: c.unfold >= 1 && !c.invalidDirection && c.data.count > 0 && direction.sqrMagnitude >= 1e-4,
      direction,
    };
  },
};
