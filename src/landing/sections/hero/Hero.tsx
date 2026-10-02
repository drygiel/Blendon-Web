import type { ReactNode } from 'react';
import wordmark from '../../../assets/landing/wordmark.png';
import { cx } from '../../../lib/cx.ts';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import styles from './Hero.module.scss';

const NAV = [
  ['#features', 'Features'],
  ['#precision', 'Precision'],
  ['#pies', 'Pie menus'],
  ['#setup', 'Setup'],
  ['#shortcuts', 'Shortcuts'],
  ['#playground', 'Playground'],
] as const;

const REEL = ['0.000', '0.031', '0.142', '0.355', '0.637', '0.937', '1.188', '1.330', '1.374'];

const FACES = [styles.faceTop, styles.faceA, styles.faceB, styles.faceC, styles.faceD];

function Box({ className, filled = true }: { className?: string; filled?: boolean }) {
  return (
    <div className={cx(styles.box, styles.p3, className)}>
      {FACES.map((face, i) => (
        <div key={i} className={cx(styles.face, face)}>
          {filled && <div className={styles.fill} />}
        </div>
      ))}
    </div>
  );
}

function Scene() {
  return (
    <div className={cx(styles.viewport, styles.viewportScene)}>
      <div className={cx(styles.world, styles.p3)}>
        <div className={styles.floor} />
        <div className={styles.axisX} />
        <div className={styles.axisZ} />
        <div className={styles.floorGlow} />
        <div className={cx(styles.ripple, styles.rippleA)} />
        <div className={cx(styles.ripple, styles.rippleB)} />
        <div className={cx(styles.ripple, styles.rippleC)} />
        <Box className={styles.pillar} />
        <Box className={styles.ghost} filled={false} />
        <div className={styles.constraint} />
        <div className={cx(styles.box, styles.p3, styles.cube)}>
          <div className={styles.cubeShadow} />
          {FACES.map((face, i) => (
            <div key={i} className={cx(styles.face, face)}>
              <div className={styles.fill} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A second viewport over the first, so the gizmo is never hidden by geometry (as in Blender).
function GizmoOverlay() {
  return (
    <div className={styles.viewport}>
      <div className={cx(styles.world, styles.p3)}>
        <div className={cx(styles.gizmoAnchor, styles.p3)}>
          <div className={cx(styles.gizmo, styles.p3)}>
            {[styles.shaftX, styles.headX, styles.shaftZ, styles.headZ, styles.shaftY, styles.headY].map((part) => (
              <div key={part} className={cx(styles.gp, part)} />
            ))}
            <div className={cx(styles.gp, styles.planeXZ)} />
            <div className={cx(styles.gp, styles.planeXY)} />
            <div className={cx(styles.screenRing, styles.billboard)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Readout() {
  return (
    <div className={cx(styles.readout, styles.hideSm)}>
      <span className={styles.readoutLabel}>Δx:</span>
      <span className={styles.reelWindow}>
        <span className={styles.reel}>
          {REEL.map((v) => (
            <span key={v}>{v}</span>
          ))}
          <span className={styles.reelFinal}>2.000</span>
        </span>
      </span>
      <span className={styles.readoutLabel}>m</span>
      <span className={styles.readoutSpace}>Global</span>
    </div>
  );
}

const ICON_WIRE = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="6.2" />
    <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
    <line x1="1.8" y1="8" x2="14.2" y2="8" />
  </svg>
);

const ICON_UNLIT = (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="6.4" fill="currentColor" />
  </svg>
);

const ICON_SHADED = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" stroke="none" />
  </svg>
);

const ICON_WIRE_SHADED = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="6.2" fill="currentColor" fillOpacity="0.35" />
    <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
  </svg>
);

function PieItem({ className, icon, label, num }: { className: string; icon: ReactNode; label: string; num: number }) {
  return (
    <div className={cx(styles.pieItem, className)}>
      {icon}
      <span>{label}</span>
      <span className={styles.pieNum}>{num}</span>
    </div>
  );
}

// Draw Mode pie: hold Z, flick, let go.
function Pie() {
  return (
    <div className={cx(styles.pieAnchor, styles.hideSm)}>
      <div className={styles.pie}>
        <div className={styles.pieShade} />
        <div className={cx(styles.trail, styles.trailLeft)} />
        <div className={cx(styles.trail, styles.trailRight)} />
        <div className={styles.pieRing} />
        <div className={styles.pieDir} />
        <div className={styles.pieTitle}>Draw Mode</div>
        <PieItem className={styles.itemWire} icon={ICON_WIRE} label="Wireframe" num={1} />
        <PieItem className={styles.itemUnlit} icon={ICON_UNLIT} label="Unlit" num={2} />
        <PieItem className={styles.itemShaded} icon={ICON_SHADED} label="Shaded" num={3} />
        <PieItem className={styles.itemWireShaded} icon={ICON_WIRE_SHADED} label="Wireframe Shaded" num={4} />
      </div>
    </div>
  );
}

const ARROW = (
  <div className={styles.hudArrow}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 7h11M8 3l4 4-4 4" />
    </svg>
  </div>
);

function HudStep({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.hudStep}>
      {children}
      <span className={styles.hudLabel}>{label}</span>
    </div>
  );
}

function Hud() {
  return (
    <div className={styles.hud}>
      <HudStep label="GRAB">
        <span className={cx(styles.hk, styles.kG)}>G</span>
      </HudStep>
      {ARROW}
      <HudStep label="AXIS">
        <span className={cx(styles.hk, styles.kX)}>X</span>
      </HudStep>
      {ARROW}
      <HudStep label="DRAG">
        <span className={cx(styles.hk, styles.kM)}>
          <svg width="16" height="22" viewBox="0 0 16 22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="1.5" y="1.5" width="13" height="19" rx="6.5" />
            <line x1="8" y1="5" x2="8" y2="9" />
          </svg>
        </span>
      </HudStep>
      {ARROW}
      <HudStep label="TYPE">
        <span className={cx(styles.hk, styles.k2)}>2</span>
      </HudStep>
      {ARROW}
      <HudStep label="CONFIRM">
        <span className={cx(styles.hk, styles.hkWide, styles.kE)}>Enter</span>
      </HudStep>
      <div className={styles.hudDivider} />
      <HudStep label="PIE">
        <span className={cx(styles.hk, styles.kZ)}>Z</span>
      </HudStep>
      <div className={styles.hudDivider} />
      <HudStep label="UNDO">
        <span className={styles.hudPair}>
          <span className={cx(styles.hk, styles.kU)}>Ctrl</span>
          <span className={cx(styles.hk, styles.kU)}>Z</span>
        </span>
      </HudStep>
    </div>
  );
}

function Annotation() {
  return (
    <div className={cx(styles.annotation, styles.hideSm)}>
      <span>PERSP · GLOBAL</span>
      <span className={styles.modeSwap}>
        <span className={cx(styles.mode, styles.modeShaded)}>SHADED</span>
        <span className={cx(styles.mode, styles.modeWire)}>WIREFRAME</span>
      </span>
    </div>
  );
}

function Cursor() {
  return (
    <div className={styles.cursor}>
      <svg width="24" height="30" viewBox="0 0 24 30">
        <path
          d="M2 2 L2 23 L7.6 17.6 L11.4 26.4 L15 24.8 L11.3 16.2 L19 16.2 Z"
          fill="#F4F2EE"
          stroke="#101216"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const NAV_ENDS = [
  [styles.navNegX, styles.axisRed, null],
  [styles.navNegY, styles.axisGreen, null],
  [styles.navNegZ, styles.axisBlue, null],
  [styles.navPosX, styles.axisRed, 'X'],
  [styles.navPosY, styles.axisGreen, 'Y'],
  [styles.navPosZ, styles.axisBlue, 'Z'],
] as const;

/** The orientation gizmo, following the camera orbit. */
function NavBall() {
  return (
    <div className={cx(styles.navBall, styles.hideMd)} aria-hidden="true">
      <div className={cx(styles.navWorld, styles.p3)}>
        <div className={styles.navAxisX} />
        <div className={styles.navAxisY} />
        <div className={styles.navAxisZ} />
        {NAV_ENDS.map(([pos, axis, label]) => (
          <div key={pos} className={cx(styles.navEnd, styles.p3, pos)}>
            <div className={cx(label ? styles.navLabel : styles.navBlob, styles.billboard, axis)}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={cx(styles.glow, styles.glowWarm)} aria-hidden="true" />
      <div className={cx(styles.glow, styles.glowCool)} aria-hidden="true" />

      {/* The 3D viewports and their overlays share one 1240x940 coordinate system. */}
      <div className={styles.stage} aria-hidden="true">
        <Scene />
        <GizmoOverlay />
        <Readout />
        <Pie />
        <Hud />
        <Annotation />
        <Cursor />
      </div>

      <div className={styles.topFade} aria-hidden="true" />
      <NavBall />

      <header className={styles.header}>
        <a className={styles.homeLink} href="#top" aria-label="Blendon home">
          <img src={wordmark} alt="Blendon" width={1200} height={239} />
        </a>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <ButtonLink href="#get" variant="secondary" small>
          Get Blendon
        </ButtonLink>
      </header>

      <div className={styles.copy}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          <span>Unity 6000.0+ · Built-in, URP &amp; HDRP · Windows, macOS, Linux</span>
        </div>
        <h1 className={styles.title}>
          The Unity Scene view,
          <br />
          rewired for <span className={styles.titleAccent}>Blender hands.</span>
        </h1>
        <p className={styles.lead}>
          Orbit the selection, grab with G, type exact values mid-drag and flick pie menus. Every feature optional,
          every key rebindable, nothing added to your builds.
        </p>
        <div className={styles.actions}>
          <ButtonLink href="#get">Get it on the Asset Store</ButtonLink>
          <ButtonLink href="#features" variant="secondary">
            Watch every feature
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
