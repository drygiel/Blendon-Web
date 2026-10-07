import { useEffect, useRef, useState } from 'react';
import { cx } from '../../../lib/cx.ts';
import { SETTINGS_SLIDES } from '../../data/content.ts';
import { KeyCap } from '../../ui/KeyCap.tsx';
import { plotStore } from '../../plotter/store.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Setup.module.scss';

const N = SETTINGS_SLIDES.length;
const pad = (n: number) => String(n).padStart(2, '0');
const SWIPE = 40;

function Arrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(styles.arrow, styles[dir])}
      aria-label={dir === 'prev' ? 'Previous settings page' : 'Next settings page'}
      onClick={onClick}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={dir === 'prev' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} />
      </svg>
    </button>
  );
}

export function Setup() {
  const [slide, setSlide] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = (d: number) => setSlide((s) => (s + d + N) % N);

  // The background's stack of pages lifts the one on show.
  useEffect(() => {
    plotStore.setup.slide = slide;
  }, [slide]);

  return (
    <Section id="setup" plate="pages">
      <SectionIntro
        eyebrow="07 / SETUP"
        title={
          <>
            Your keys. Your setup. <em>One window.</em>
          </>
        }
      />
      <p className={styles.lead} data-reveal="rise">
        Every feature gets its own page in Tools → Blendon: an illustrated card with how it works and its keys, then the
        settings. Flip through a few.
      </p>

      <div className={styles.split}>
        <div className={styles.viewer} data-reveal="print">
          <div
            className={styles.carousel}
            onTouchStart={(e) => {
              touchX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const t = e.changedTouches[0];
              const start = touchX.current;
              touchX.current = null;
              if (start === null || !t) return;
              const dx = t.clientX - start;
              if (Math.abs(dx) > SWIPE) go(dx < 0 ? 1 : -1);
            }}
          >
            {SETTINGS_SLIDES.map((s, i) => (
              <img
                key={s.title}
                src={s.image}
                alt={`Blendon settings window, ${s.title} page`}
                aria-hidden={i !== slide}
                loading="lazy"
                className={cx(styles.slide, i === slide && styles.current)}
              />
            ))}
            <Arrow dir="prev" onClick={() => go(-1)} />
            <Arrow dir="next" onClick={() => go(1)} />
          </div>
          <div className={styles.dots}>
            {SETTINGS_SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={cx(styles.dot, i === slide && styles.current)}
                aria-label={`Show the ${s.title} settings page`}
                aria-current={i === slide}
                onClick={() => setSlide(i)}
              >
                <span />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.details} aria-live="polite" data-reveal="rise">
          {SETTINGS_SLIDES.map((s, i) => (
            <div key={s.title} aria-hidden={i !== slide} className={cx(styles.detail, i === slide && styles.current)}>
              <div className={styles.counter}>
                <span>SETTINGS PAGE</span>
                <span>
                  <span className={styles.num}>{pad(i + 1)}</span> / {pad(N)}
                </span>
              </div>
              <h3 className={styles.title}>{s.title}</h3>
              <p className={styles.sub}>{s.sub}</p>
              <p className={styles.desc}>{s.desc}</p>
              <div className={styles.onPage}>
                <span className={styles.onPageLabel}>ON THIS PAGE</span>
                <div className={styles.chips}>
                  {s.chips.map((c) => (
                    <KeyCap key={c} size="chip">
                      {c}
                    </KeyCap>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
