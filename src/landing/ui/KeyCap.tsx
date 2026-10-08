import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import styles from './KeyCap.module.scss';

/** A leading "~" marks a plain separator ("+", "/", "drag"); everything else is a keycap. */
export type KeyTokens = string[];

export type KeyCapSize = 'md' | 'sm' | 'chip' | 'xl';

interface KeyCapProps {
  children: ReactNode;
  size?: KeyCapSize;
  wide?: boolean;
}

export function KeyCap({ children, size = 'md', wide = false }: KeyCapProps) {
  return (
    <span className={cx(styles.cap, size !== 'md' && styles[size], wide && styles.wide)} data-key="">
      {children}
    </span>
  );
}

interface KeysProps {
  tokens: KeyTokens;
  size?: KeyCapSize;
  /** Right-align when the row wraps. */
  end?: boolean;
  className?: string;
}

/** A key sequence: keycaps, with "~"-prefixed tokens as plain separators between them. */
export function Keys({ tokens, size, end = false, className }: KeysProps) {
  return (
    <span className={cx(styles.keys, end && styles.end, className)}>
      {tokens.map((t, i) =>
        t.startsWith('~') ? (
          <span key={i}>{t.slice(1)}</span>
        ) : (
          <KeyCap key={i} size={size}>
            {t}
          </KeyCap>
        ),
      )}
    </span>
  );
}
