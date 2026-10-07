import wordmark from '../../../assets/landing/wordmark.png';
import { PRICE, STORE_URL } from '../../../lib/product.ts';
import { PenTitle } from '../../plotter/PenTitle.tsx';
import { TypeText } from '../../plotter/TypeText.tsx';
import { ButtonLink } from '../../ui/ButtonLink.tsx';
import styles from './Hero.module.scss';

const NAV = [
  ['#video', 'Video'],
  ['#features', 'Features'],
  ['#precision', 'Precision'],
  ['#pies', 'Pie menus'],
  ['#tutorial', 'Tutorial'],
  ['#setup', 'Setup'],
  ['#try', 'Try it'],
  ['#shortcuts', 'Shortcuts'],
  ['#faq', 'FAQ'],
] as const;

export function Hero() {
  return (
    <section id="top" className={styles.hero} data-plate="hero" data-hud="00 / SCENE VIEW">
      <header className={styles.header}>
        <a className={styles.homeLink} href="#top" aria-label="Blendon home">
          <img src={wordmark} alt="Blendon" width={602} height={120} />
        </a>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <ButtonLink href={STORE_URL} variant="secondary" small>
          Get Blendon
        </ButtonLink>
      </header>

      <div className={styles.copy}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          <TypeText text="Unity 6000.0+ · Built-in, URP & HDRP · Windows, macOS, Linux" />
        </div>
        <PenTitle as="h1" className={styles.title}>
          The Unity Scene view, rewired for <em>Blender hands.</em>
        </PenTitle>
        <p className={styles.lead} data-reveal="rise">
          Orbit the selection, grab with G, type exact values mid-drag and flick pie menus. Every feature optional,
          every key rebindable, nothing added to your builds.
        </p>
        <div className={styles.actions} data-reveal="rise">
          <ButtonLink href={STORE_URL}>Get it on the Asset Store · {PRICE}</ButtonLink>
          <ButtonLink href="#try" variant="secondary">
            Try it in your browser
          </ButtonLink>
        </div>
      </div>

      {/* The plotter draws the Scene view here: floor, axes, the selected cube, its gizmo and the orbit. */}
      <div className={styles.stage} data-plot-anchor="hero-stage" aria-hidden="true" />
    </section>
  );
}
