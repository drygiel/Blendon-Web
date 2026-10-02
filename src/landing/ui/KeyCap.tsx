import type { ReactNode } from 'react';
import type { KeyTokens } from '../data/content.ts';
import styles from './KeyCap.module.scss';

export type KeyCapSize = 'md' | 'sm' | 'chip' | 'xl';

interface KeyCapProps {
  children: ReactNode;
  size?: KeyCapSize;
  wide?: boolean;
}

export function KeyCap({ children, size = 'md', wide = false }: KeyCapProps) {
  const cls = [styles.cap, size !== 'md' && styles[size], wide && styles.wide].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
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
    <span className={[styles.keys, end && styles.end, className].filter(Boolean).join(' ')}>
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
