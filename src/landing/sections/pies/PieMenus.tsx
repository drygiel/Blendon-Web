import '@fontsource/inter/400.css';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { cx } from '../../../lib/cx.ts';
import { PIES } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { PickButton } from '../../ui/PickButton.tsx';
import { POLAR_RING } from '../../plotter/plates/polar.ts';
import { plotStore } from '../../plotter/store.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './PieMenus.module.scss';

// Blender's pie order: left, up, right, down, then upper-right, lower-right, lower-left, upper-left.
const DIRS = [180, 90, 0, 270, 45, 315, 225, 135];

// PieMenuStyles / PieMenuSettings of the plugin, in points; the demo draws them `scale` times larger.
const RADIUS = 100;
const THRESHOLD = 12;
const RING_OUTER = 23;
const RING_THICKNESS = 9;
const MAX_SCALE = 1.6;
// Widest pie's half-width in points (a 190 pt pill on a diagonal), so every pie fits the stage.
const HALF_WIDTH = 240;
const HALF_HEIGHT = RADIUS + 24 + 8;
const COS45 = Math.cos(Math.PI / 4);

const iconUrl = (name: string) => `${import.meta.env.BASE_URL}scene/icons/${name}.png`;
const CARDS = [
  ['Build your own', 'A visual editor makes new pies from Editor actions or any menu command, on any key.'],
  ['Numbered items', 'While a pie is open, the top-row or keypad number runs its item directly.'],
  [
    'State at a glance',
    "The active tool, draw mode or snap toggle is tinted blue. Items that can't run are greyed in place, so the ring never shifts.",
  ],
] as const;

/** Blender's segment test reduced to the nearest occupied direction; a greyed slot keeps its wedge. */
function select(count: number, disabled: Set<number>, angle: number) {
  let best = -1;
  let bestCos = COS45 - 1e-4;
  for (let i = 0; i < count; i++) {
    const c = Math.cos(angle - ((DIRS[i] ?? 0) * Math.PI) / 180);
    if (c > bestCos) {
      bestCos = c;
      best = i;
    }
  }
  return disabled.has(best) ? -1 : best;
}

/** The ring's band as an arc of `half` degrees either side of +X, in points. */
function arc(half: number) {
  const r = RING_OUTER - 1 - RING_THICKNESS / 2;
  const a = (half * Math.PI) / 180;
  const x = (r * Math.cos(a)).toFixed(3);
  const y = (r * Math.sin(a)).toFixed(3);
  return `M ${x} -${y} A ${r} ${r} 0 0 1 ${x} ${y}`;
}

export function PieMenus() {
  const [pieId, setPieId] = useState('draw');
  const [current, setCurrent] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(PIES.map((p) => [p.id, p.active >= 0 ? [p.active] : []])),
  );
  // Cursor direction from the ring's centre, GUI space (y down); null inside the deadzone or off the section.
  const [angle, setAngle] = useState<number | null>(null);
  const [scale, setScale] = useState(MAX_SCALE);
  const stageRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setScale(Math.min(MAX_SCALE, e.contentRect.width / (HALF_WIDTH * 2)));
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Selection is by angle alone, so the pointer picks from anywhere in the section, not only over the pie.
  useEffect(() => {
    const section = stageRef.current?.closest('section');
    if (!section) return;
    const move = (e: globalThis.PointerEvent) => {
      const c = centerRef.current?.getBoundingClientRect();
      if (!c) return;
      const dx = e.clientX - c.left;
      const dy = e.clientY - c.top;
      setAngle(Math.hypot(dx, dy) / scale < THRESHOLD ? null : Math.atan2(dy, dx));
    };
    const leave = () => setAngle(null);
    section.addEventListener('pointermove', move);
    section.addEventListener('pointerleave', leave);
    return () => {
      section.removeEventListener('pointermove', move);
      section.removeEventListener('pointerleave', leave);
    };
  }, [scale]);

  // The background's polar paper follows the pointer and the item it picks.
  useEffect(() => {
    const p = PIES.find((x) => x.id === pieId) ?? PIES[0];
    const h = p && angle !== null ? select(p.items.length, new Set(p.disabled), -angle) : -1;
    plotStore.pie.angle = angle;
    plotStore.pie.hot = h >= 0 ? (-(DIRS[h] ?? 0) * Math.PI) / 180 : null;
    plotStore.pie.radius = RADIUS * scale;
  }, [angle, pieId, scale]);

  const pie = PIES.find((p) => p.id === pieId) ?? PIES[0];
  if (!pie) return null;

  const disabled = new Set(pie.disabled);
  const count = pie.items.length;
  const hot = angle === null ? -1 : select(count, disabled, -angle);
  const on = current[pie.id] ?? [];

  const track = (e: PointerEvent) => {
    const c = centerRef.current?.getBoundingClientRect();
    if (!c) return;
    const dx = e.clientX - c.left;
    const dy = e.clientY - c.top;
    setAngle(Math.hypot(dx, dy) / scale < THRESHOLD ? null : Math.atan2(dy, dx));
  };

  const pick = (i: number) => {
    if (i < 0 || i >= count || disabled.has(i)) return;
    setCurrent((all) => {
      const was = all[pie.id] ?? [];
      const next = pie.toggles ? (was.includes(i) ? was.filter((x) => x !== i) : [...was, i]) : [i];
      return { ...all, [pie.id]: next };
    });
  };

  return (
    <Section id="pies" plate="polar">
      <SectionIntro
        eyebrow="05 / PIE MENUS"
        title={
          <>
            Eight pies. <em>One key each.</em>
          </>
        }
        lead="Hold the key, flick toward an item and let go. Or tap it and the menu stays open for a click. Selection is by angle alone, so a flick far past an item still picks it. Point anywhere around the ring below and click."
      />

      <div className={styles.explorer}>
        <div className={styles.list} data-reveal="stagger">
          {PIES.map((p) => (
            <PickButton
              key={p.id}
              compact
              accent="blue"
              selected={p.id === pie.id}
              onPick={() => {
                setPieId(p.id);
                setAngle(null);
              }}
              title={p.title}
              aside={<Keys tokens={['~hold', ...p.keys]} size="sm" />}
            />
          ))}
        </div>

        <div className={styles.viewport}>
          <div
            ref={stageRef}
            className={styles.stage}
            data-reveal="pie"
            data-reveal-at="pie"
            tabIndex={0}
            aria-label={`${pie.title} pie menu. Press 1 to ${count} to pick an item.`}
            style={{ '--k': scale, height: `${HALF_HEIGHT * 2 * scale}px` } as CSSProperties}
            onPointerDown={track}
            onClick={() => pick(hot)}
            onKeyDown={(e) => {
              const n = Number(e.key);
              if (n >= 1 && n <= count) pick(n - 1);
            }}
          >
            {/* The pen leaps into this point after the title, then circles it. */}
            <div
              key={pie.id}
              ref={centerRef}
              className={styles.pie}
              data-plot-anchor="pie-center"
              data-plot-station="pie"
              data-plot-radius={(RADIUS * scale * POLAR_RING).toFixed(1)}
            >
              <svg
                className={styles.ring}
                viewBox={`${-RING_OUTER} ${-RING_OUTER} ${RING_OUTER * 2} ${RING_OUTER * 2}`}
                aria-hidden
              >
                <circle className={styles.band} r={RING_OUTER - 1 - RING_THICKNESS / 2} />
                {angle !== null && (
                  <path
                    className={styles.wedge}
                    d={arc(180 / count)}
                    transform={`rotate(${((angle * 180) / Math.PI).toFixed(2)})`}
                  />
                )}
                <circle className={styles.edge} r={RING_OUTER - 1} />
                <circle className={styles.edge} r={RING_OUTER - 1 - RING_THICKNESS} />
              </svg>
              <div className={styles.title}>{pie.title}</div>
              {pie.items.map((label, i) => {
                const a = ((DIRS[i] ?? 0) * Math.PI) / 180;
                const vx = Math.cos(a);
                const vy = Math.sin(a);
                const x = vx * RADIUS;
                const y = -vy * RADIUS;
                const icon = pie.icons[i];
                return (
                  <button
                    key={label}
                    type="button"
                    tabIndex={-1}
                    aria-disabled={disabled.has(i)}
                    aria-pressed={on.includes(i)}
                    className={cx(
                      styles.item,
                      on.includes(i) && styles.current,
                      i === hot && styles.hot,
                      disabled.has(i) && styles.disabled,
                    )}
                    style={
                      {
                        '--n': i,
                        '--x': x,
                        '--y': y,
                        // Pill edges, not centres, sit on the circle: Blender's half-size shift.
                        '--ax': vx > 0.01 ? '0%' : vx < -0.01 ? '-100%' : '-50%',
                        '--ay': vy > 0.99 ? '-100%' : vy < -0.99 ? '0%' : '-50%',
                      } as CSSProperties
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(i);
                    }}
                  >
                    {icon && <img className={styles.icon} src={iconUrl(icon)} alt="" draggable={false} />}
                    <span className={styles.label}>{label}</span>
                    <span className={styles.num}>{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className={styles.note}>{pie.note}</p>
        </div>
      </div>

      <div className={styles.cards} data-reveal="stagger">
        {CARDS.map(([title, text]) => (
          <div key={title} className={styles.card}>
            <span className={styles.cardTitle}>{title}</span>
            <span className={styles.cardText}>{text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
