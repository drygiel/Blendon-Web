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

  // The aurora rises over the last stretch of the page, so it greets the visitor at the bottom.
  useEffect(() => {
    const el = aurora.current;
    if (!el) return;
    const root = document.documentElement;
    let raf = 0;
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
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <footer className={styles.footer}>
      <div ref={aurora} className={styles.aurora} aria-hidden="true">
        <span />
        <span />
        <span />
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
