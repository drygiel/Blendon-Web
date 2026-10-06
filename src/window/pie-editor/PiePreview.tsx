// The editor's ring: the pie as the Scene view draws it, with the gesture taken away. A slot opens the
// action picker, its icon the icon picker, and a right click the slot menu.
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { ColorDefaults } from '../../scene/blendon/color.ts';
import { GizmoColors } from '../../scene/blendon/gizmos/colors.ts';
import { PieMenuData, RadialDirections } from '../../scene/blendon/piemenus/model.ts';
import { PieMenuStyles as S } from '../../scene/blendon/piemenus/renderer.ts';
import { PieMenuSettings } from '../../scene/blendon/piemenus/settings.ts';
import { iconUrl } from '../../scene/unity/icons.ts';
import { hasIcon, slotLabel, type PieDraft } from './draft.ts';

export const EmptySlotLabel = 'Empty';

/** Room above the ring for the menu's title. */
const TitleSpace = 22;
/** Air between the widest slot and the card's edge. */
const Padding = 12;
const TitleGap = 4;
const TitleHeight = 16;

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 6;
  measureCtx.font = `400 ${S.FontSize}px Inter, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

/** PieMenuRenderer.measureItem. */
function pillWidth(label: string, icon: boolean, digit: number) {
  let w = S.PaddingLeft + S.PaddingRight + textWidth(label);
  if (icon) w += S.IconSize + S.IconGap;
  if (digit > 0) w += S.DigitGap + textWidth(String(digit));
  return Math.ceil(Math.min(Math.max(w, S.MinItemWidth), S.MaxItemWidth));
}

export type SlotPart = 'pill' | 'icon';

interface Props {
  draft: PieDraft;
  /** The card's inner width, which the radius is fitted to. */
  width: number;
  onPick: (slot: number, part: SlotPart, el: HTMLElement) => void;
  onMenu: (slot: number, e: MouseEvent) => void;
}

export function PiePreview({ draft, width, onPick, onMenu }: Props) {
  // Widths measured before Inter has loaded would be the fallback font's.
  const [, setFontsReady] = useState(false);
  useEffect(() => void document.fonts.ready.then(() => setFontsReady(true)), []);
  const digits = PieMenuSettings.ShowAccelerators;
  const slots = draft.items.map((s, i) => {
    const filled = !!s.target;
    const label = filled ? slotLabel(s) : EmptySlotLabel;
    const icon = filled && hasIcon(s.icon) ? s.icon : '';
    const digit = digits ? PieMenuData.acceleratorOf(i) : 0;
    return { filled, label, icon, digit, w: pillWidth(label, !!icon, digit), target: s.target };
  });

  // The user's radius wherever the widest slot still fits, and only as much less as it takes otherwise;
  // never below the ring plus one pill, where slots would cover the centre.
  const widest = Math.max(...slots.map((s) => s.w));
  const fits = width / 2 - Padding - widest;
  const radius = Math.max(S.RingOuterRadius + S.ItemHeight, Math.min(PieMenuSettings.Radius, fits));
  const cx = Math.round(width / 2);
  const cy = TitleSpace + radius + S.ItemHeight;

  const vars = {
    '--pe-item': PieMenuSettings.ItemColor.css(),
    '--pe-hi': PieMenuSettings.HighlightColor.css(),
    '--pe-text': PieMenuSettings.TextColor.css(),
    '--pe-ring': PieMenuSettings.RingColor.css(),
    '--pe-outline': GizmoColors.Outline.css(),
    '--pe-plate': ColorDefaults.PieIconPlateHover.css(),
    height: TitleSpace + (radius + S.ItemHeight) * 2 + 1,
  } as CSSProperties;

  return (
    <div className="pe-ring" style={vars}>
      <div
        className="pe-center"
        style={{ left: cx - S.RingOuterRadius, top: cy - S.RingOuterRadius, borderWidth: S.RingThickness }}
      />
      {draft.title && (
        <div
          className="pe-rtitle"
          style={{
            left: cx - 100,
            top: cy - S.RingOuterRadius - TitleGap - TitleHeight,
            color: PieMenuSettings.TextColor.css(ColorDefaults.PieTitleFade),
          }}
        >
          {draft.title}
        </div>
      )}
      {slots.map((s, i) => {
        // PieLayout.itemCenter: pill edges, not centres, sit on the circle.
        const v = RadialDirections.vector(RadialDirections.FillOrder[i]);
        const ax = cx + v.x * radius;
        const ay = cy - v.y * radius;
        const left = ax + (v.x > 0.01 ? 0 : v.x < -0.01 ? -s.w : -s.w / 2);
        const top = ay + (v.y > 0.99 ? -S.ItemHeight : v.y < -0.99 ? 0 : -S.ItemHeight / 2);
        const tip = s.filled
          ? `${s.target}\n\nClick to change what it runs, click the icon to change that, right click for everything else`
          : 'Empty - click to choose what this direction runs';
        return (
          <button
            key={i}
            className={'pe-slot' + (s.filled ? '' : ' empty')}
            style={{ left: Math.round(left), top: Math.round(top), width: s.w, height: S.ItemHeight }}
            title={tip}
            aria-label={`Slot ${i + 1}: ${s.label}`}
            onClick={(e) => onPick(i, 'pill', e.currentTarget)}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(i, e);
            }}
          >
            {s.icon && (
              <span
                className="pe-ic"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(i, 'icon', e.currentTarget);
                }}
              >
                <img src={iconUrl(s.icon)} alt="" width={S.IconSize} height={S.IconSize} draggable={false} />
              </span>
            )}
            <span className="pe-lb">{s.label}</span>
            {s.digit > 0 && <span className="pe-dg">{s.digit}</span>}
          </button>
        );
      })}
    </div>
  );
}
