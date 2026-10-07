import { useEffect, useRef } from 'react';
import { MANUAL_URL, NEW_TAB } from '../../../lib/links.ts';
import styles from './Footer.module.scss';

/** Scroll before the very bottom over which the aurora rises. */
const RISE_PX = 520;

const LINKS = [
  ['#playground', 'Playground'],
  [MANUAL_URL, 'Manual (PDF)'],
  ['#get', 'Changelog'],
  ['#get', 'Support [SUPPORT_URL]'],
] as const;

export function Footer() {
  const aurora = useRef<HTMLDivElement>(null);

  // The aurora rises over the last stretch of the page, so it greets the visitor at the bottom, and leans
  // after the pointer as it moves across.
  useEffect(() => {
    const el = aurora.current;
    if (!el) return;
    const root = document.documentElement;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let lean = 0;
    let mx = 0;
    let target = 0;
    const update = () => {
      raf = 0;
      const left = root.scrollHeight - root.clientHeight - window.scrollY;
      const rise = Math.min(1, Math.max(0, 1 - left / RISE_PX));
      el.style.setProperty('--rise', rise.toFixed(3));
      el.toggleAttribute('data-on', rise > 0);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // Eases toward the pointer slowly, and only while it still has a way to go.
    const follow = () => {
      mx += (target - mx) * 0.04;
      el.style.setProperty('--mx', mx.toFixed(4));
      lean = Math.abs(target - mx) > 0.001 ? requestAnimationFrame(follow) : 0;
    };
    const point = (e: PointerEvent) => {
      if (still || !el.hasAttribute('data-on')) return;
      target = e.clientX / window.innerWidth - 0.5;
      if (!lean) lean = requestAnimationFrame(follow);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pointermove', point, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(lean);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', point);
    };
  }, []);

  return (
    <footer className={styles.footer}>
      {/* The outer box clips, so the risen layer inside never lengthens the page. */}
      <div className={styles.aurora} aria-hidden="true">
        <div ref={aurora} className={styles.sky}>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className={styles.inner}>
        <div className={styles.legal}>
          <span className={styles.owner}>© 2026 VeraCorp</span>
          <span className={styles.note}>
            Blender is a trademark of the Blender Foundation. Unity is a trademark of Unity Technologies. Blendon is an
            independent product, not affiliated with either.
          </span>
        </div>
        <nav className={styles.nav} aria-label="Footer">
          {LINKS.map(([href, label]) => (
            <a key={label} href={href} {...(href === MANUAL_URL && NEW_TAB)}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
