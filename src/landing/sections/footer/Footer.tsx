import { MANUAL_URL, NEW_TAB } from '../../../lib/links.ts';
import styles from './Footer.module.scss';

const LINKS = [
  ['#playground', 'Playground'],
  [MANUAL_URL, 'Manual (PDF)'],
  ['#get', 'Changelog'],
  ['#get', 'Support [SUPPORT_URL]'],
] as const;

export function Footer() {
  return (
    <footer className={styles.footer}>
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
