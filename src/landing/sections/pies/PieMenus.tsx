import '@fontsource/inter/400.css';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { cx } from '../../../lib/cx.ts';
import { useReducedMotion } from '../../../lib/hooks.ts';
import { PIES } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { PickButton } from '../../ui/PickButton.tsx';
import { TAU, sprites } from '../../plotter/draw.ts';
import { POLAR_RING, paintGlow, paintSector, sectorBox, sectorReach } from '../../plotter/plates/polar.ts';
import { plotAnchor, plotStation } from '../../plotter/contract.ts';
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

/** The polar paper's pointer state: the sector eases toward the picked item, the angle arc toward the pointer. */
interface Follow {
  angle: number | null;
  hot: number | null;
  sector: number;
  pointer: number;
  vis: number;
}

const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** One frame of easing; true while anything still moves. */
function ease(f: Follow, reduced: boolean) {
  const k = reduced ? 1 : 0.25;
  const target = f.hot === null ? 0 : 1;
  f.vis += (target - f.vis) * (reduced ? 1 : 0.18);
  if (f.hot !== null) f.sector += turn(f.sector, f.hot) * k;
  if (f.angle !== null) f.pointer += turn(f.pointer, f.angle) * k;
  return (
    Math.abs(target - f.vis) > 0.002 ||
    (f.hot !== null && Math.abs(turn(f.sector, f.hot)) > 0.002) ||
    (f.angle !== null && Math.abs(turn(f.pointer, f.angle)) > 0.002)
  );
}

interface FollowNodes {
  sector: HTMLCanvasElement;
  angle: SVGSVGElement;
  arc: SVGPathElement;
  dot: SVGCircleElement;
  theta: HTMLElement;
}

/** The sector turned toward the item, and the pointer's angle as an arc on the ring the pen drew. */
function show(f: Follow, n: FollowNodes, R: number) {
  const vis = f.vis > 0.01 ? f.vis.toFixed(3) : '0';
  for (const el of [n.sector, n.angle, n.theta]) el.style.opacity = vis;
  n.sector.style.transform = `rotate(${f.sector.toFixed(4)}rad)`;
  const r = R * POLAR_RING;
  // Counterclockwise from +X, as mathematics counts angles.
  const th = ((-f.pointer % TAU) + TAU) % TAU;
  const ex = Math.cos(f.pointer) * r;
  const ey = Math.sin(f.pointer) * r;
  n.arc.setAttribute('d', th > 1e-3 ? `M ${r} 0 A ${r} ${r} 0 ${th > Math.PI ? 1 : 0} 0 ${ex} ${ey}` : '');
  n.dot.setAttribute('cx', ex.toFixed(2));
  n.dot.setAttribute('cy', ey.toFixed(2));
  const left = Math.cos(f.pointer) < -0.2;
  n.theta.textContent = `θ = ${Math.round((th * 180) / Math.PI)}°`;
  n.theta.style.transform = `translate(${(ex + (left ? -10 : 10)).toFixed(1)}px, ${(ey - 8).toFixed(1)}px) translate(${left ? -100 : 0}%, -80%)`;
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
  const glowRef = useRef<HTMLDivElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const sectorRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef<SVGSVGElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const thetaRef = useRef<HTMLSpanElement>(null);
  const follow = useRef<Follow>({ angle: null, hot: null, sector: 0, pointer: 0, vis: 0 });
  const followRaf = useRef(0);
  const followSize = useRef({ R: RADIUS * MAX_SCALE, reduced: false });
  const reduced = useReducedMotion();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setScale(Math.min(MAX_SCALE, e.contentRect.width / (HALF_WIDTH * 2)));
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // The plotter lights the glow and the pointer's layer on the stage; the glow flickers only while on screen.
  useEffect(() => {
    const stage = stageRef.current;
    const el = glowRef.current;
    if (!stage || !el) return;
    plotStore.pie.stage = stage;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute('data-on', e?.isIntersecting ?? false));
    io.observe(el);
    return () => {
      io.disconnect();
      plotStore.pie.stage = null;
      // Cleared too, or a remount would think the loop still runs and never start it again.
      cancelAnimationFrame(followRaf.current);
      followRaf.current = 0;
    };
  }, []);

  useEffect(() => {
    const c = glowCanvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const size = RADIUS * scale * 4;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintGlow(g, sprites(), size, RADIUS * scale);
  }, [scale]);

  // The sector reaches out from the centre but never past the section's bottom, where the paper stops.
  useEffect(() => {
    const c = sectorRef.current;
    const g = c?.getContext('2d');
    const section = stageRef.current?.closest('section');
    if (!c || !g || !section) return;
    const paint = () => {
      const center = centerRef.current?.getBoundingClientRect();
      if (!center) return;
      const R = RADIUS * scale;
      const far = sectorReach(R, section.getBoundingClientRect().bottom + 40 - center.top);
      // Only the wedge's box, turned about the pie's centre: a small layer to composite.
      const box = sectorBox(far, R);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.ceil(box.w * dpr);
      c.height = Math.ceil(box.h * dpr);
      Object.assign(c.style, {
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.w}px`,
        height: `${box.h}px`,
        transformOrigin: `${-box.x}px ${-box.y}px`,
      });
      g.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
      paintSector(g, far, R);
    };
    const ro = new ResizeObserver(paint);
    ro.observe(section);
    return () => ro.disconnect();
  }, [scale]);

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

  // The polar paper's sector and angle follow the pointer and the item it picks, in a frame loop that runs
  // only while they move.
  useEffect(() => {
    const p = PIES.find((x) => x.id === pieId) ?? PIES[0];
    const h = p && angle !== null ? select(p.items.length, new Set(p.disabled), -angle) : -1;
    const f = follow.current;
    f.angle = angle;
    f.hot = h >= 0 ? (-(DIRS[h] ?? 0) * Math.PI) / 180 : null;
    plotStore.pie.radius = RADIUS * scale;
    const sector = sectorRef.current;
    const angleSvg = angleRef.current;
    const arc = arcRef.current;
    const dot = dotRef.current;
    const theta = thetaRef.current;
    if (!sector || !angleSvg || !arc || !dot || !theta) return;
    const nodes = { sector, angle: angleSvg, arc, dot, theta };
    followSize.current = { R: RADIUS * scale, reduced };
    const step = () => {
      const moving = ease(f, followSize.current.reduced);
      show(f, nodes, followSize.current.R);
      followRaf.current = moving ? requestAnimationFrame(step) : 0;
    };
    if (!followRaf.current) followRaf.current = requestAnimationFrame(step);
  }, [angle, pieId, scale, reduced]);

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
            <div ref={glowRef} className={styles.glow} aria-hidden="true">
              <canvas
                ref={glowCanvasRef}
                style={{ width: `${RADIUS * scale * 4}px`, height: `${RADIUS * scale * 4}px` }}
              />
            </div>
            <div className={styles.polar} aria-hidden="true">
              <canvas ref={sectorRef} className={styles.sector} />
              <svg
                ref={angleRef}
                className={styles.angle}
                viewBox={`${-RADIUS * scale * 1.4} ${-RADIUS * scale * 1.4} ${RADIUS * scale * 2.8} ${RADIUS * scale * 2.8}`}
                style={{ width: `${RADIUS * scale * 2.8}px`, height: `${RADIUS * scale * 2.8}px` }}
              >
                <path ref={arcRef} />
                <circle ref={dotRef} r={2.5} />
              </svg>
              <span ref={thetaRef} className={styles.theta} />
            </div>
            {/* The pen leaps into this point straight from the end of the title's underline, then circles it. */}
            <div
              key={pie.id}
              ref={centerRef}
              className={styles.pie}
              {...plotAnchor('pie-center')}
              {...plotStation({ name: 'pie', radius: RADIUS * scale * POLAR_RING, fromTitle: true })}
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
