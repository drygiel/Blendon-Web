// The Playground on a page of its own: the Try It dock filling the window, under a thin bar back to the
// main page that can be closed for the whole view.
import { useState } from 'react';
import wordmark from '../assets/landing/wordmark.png';
import { Dock } from '../landing/sections/scene/Dock.tsx';
import styles from './PlaygroundPage.module.scss';

export function PlaygroundPage() {
  const [header, setHeader] = useState(true);
  return (
    <div className={styles.page}>
      {header && (
        <header className={styles.header}>
          <a className={styles.home} href={import.meta.env.BASE_URL}>
            <img src={wordmark} alt="Blendon" width={80} height={16} />
          </a>
          <span className={styles.title}>Playground</span>
          <a className={styles.back} href={import.meta.env.BASE_URL}>
            Back to the Blendon page
          </a>
          <span className={styles.spacer} />
          <span className={styles.warn} role="note">
            <strong>Demo only:</strong> some features may not work properly or be unavailable in the browser.
          </span>
          <button type="button" className={styles.close} onClick={() => setHeader(false)} aria-label="Hide this bar">
            <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </header>
      )}
      <main className={styles.dock}>
        <Dock page />
      </main>
    </div>
  );
}
