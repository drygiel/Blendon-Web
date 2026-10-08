// The polar paper under the demo pie: the ring's glow, the picked item's sector and the pointer's angle. The
// plotter draws the paper itself and lights these layers; the pointer only moves them, in a frame loop that
// runs while they ease.
import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '../../../lib/hooks.ts';
import { TAU, sprites } from '../../plotter/draw.ts';
import { POLAR_RING, paintGlow, paintSector, sectorBox, sectorReach } from '../../plotter/plates/polar.ts';
import { plotStore } from '../../plotter/store.ts';
import { RADIUS } from './pie-geometry.ts';
import styles from './PieMenus.module.scss';

/** The sector eases toward the picked item, the angle arc toward the pointer. */
interface Follow {
  angle: number | null;
  hot: number | null;
  sector: number;
  pointer: number;
  vis: number;
}

interface FollowNodes {
  sector: HTMLCanvasElement;
  angle: SVGSVGElement;
  arc: SVGPathElement;
  dot: SVGCircleElement;
  theta: HTMLElement;
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

interface PolarPaperProps {
  /** The pie's stage, which the plotter lights through --glow and --paper. */
  stage: RefObject<HTMLDivElement | null>;
  /** The pie's centre point. */
  center: RefObject<HTMLDivElement | null>;
  scale: number;
  /** The pointer's direction in GUI space, or null. */
  angle: number | null;
  /** The picked item's direction in GUI space, or null. */
  hot: number | null;
}

export function PolarPaper({ stage, center, scale, angle, hot }: PolarPaperProps) {
  const glowRef = useRef<HTMLDivElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const sectorRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef<SVGSVGElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const thetaRef = useRef<HTMLSpanElement>(null);
  const follow = useRef<Follow>({ angle: null, hot: null, sector: 0, pointer: 0, vis: 0 });
  const followRaf = useRef(0);
  const followSize = useRef({ R: RADIUS * scale, reduced: false });
  const reduced = useReducedMotion();
  const R = RADIUS * scale;

  // The plotter lights the glow and the pointer's layer on the stage; the glow flickers only while on screen.
  useEffect(() => {
    const el = glowRef.current;
    if (!stage.current || !el) return;
    plotStore.pie.stage = stage.current;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute('data-on', e?.isIntersecting ?? false));
    io.observe(el);
    return () => {
      io.disconnect();
      plotStore.pie.stage = null;
      // Cleared too, or a remount would think the loop still runs and never start it again.
      cancelAnimationFrame(followRaf.current);
      followRaf.current = 0;
    };
  }, [stage]);

  useEffect(() => {
    plotStore.pie.radius = R;
    const c = glowCanvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const size = R * 4;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintGlow(g, sprites(), size, R);
  }, [R]);

  // The sector reaches out from the centre but never past the section's bottom, where the paper stops.
  useEffect(() => {
    const c = sectorRef.current;
    const g = c?.getContext('2d');
    const section = stage.current?.closest('section');
    if (!c || !g || !section) return;
    const paint = () => {
      const middle = center.current?.getBoundingClientRect();
      if (!middle) return;
      const far = sectorReach(R, section.getBoundingClientRect().bottom + 40 - middle.top);
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
  }, [stage, center, R]);

  useEffect(() => {
    const f = follow.current;
    f.angle = angle;
    f.hot = hot;
    const sector = sectorRef.current;
    const angleSvg = angleRef.current;
    const arc = arcRef.current;
    const dot = dotRef.current;
    const theta = thetaRef.current;
    if (!sector || !angleSvg || !arc || !dot || !theta) return;
    const nodes = { sector, angle: angleSvg, arc, dot, theta };
    followSize.current = { R, reduced };
    const step = () => {
      const moving = ease(f, followSize.current.reduced);
      show(f, nodes, followSize.current.R);
      followRaf.current = moving ? requestAnimationFrame(step) : 0;
    };
    if (!followRaf.current) followRaf.current = requestAnimationFrame(step);
  }, [angle, hot, R, reduced]);

  return (
    <>
      <div ref={glowRef} className={styles.glow} aria-hidden="true">
        <canvas ref={glowCanvasRef} style={{ width: `${R * 4}px`, height: `${R * 4}px` }} />
      </div>
      <div className={styles.polar} aria-hidden="true">
        <canvas ref={sectorRef} className={styles.sector} />
        <svg
          ref={angleRef}
          className={styles.angle}
          viewBox={`${-R * 1.4} ${-R * 1.4} ${R * 2.8} ${R * 2.8}`}
          style={{ width: `${R * 2.8}px`, height: `${R * 2.8}px` }}
        >
          <path ref={arcRef} />
          <circle ref={dotRef} r={2.5} />
        </svg>
        <span ref={thetaRef} className={styles.theta} />
      </div>
    </>
  );
}
