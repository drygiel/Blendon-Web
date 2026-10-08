import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { NEW_TAB } from '../../lib/links.ts';
import styles from './Button.module.scss';

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  small?: boolean;
  newTab?: boolean;
}

export function ButtonLink({ href, children, variant = 'primary', small = false, newTab = false }: ButtonLinkProps) {
  return (
    <a className={cx(styles.button, styles[variant], small && styles.small)} href={href} {...(newTab && NEW_TAB)}>
      {children}
    </a>
  );
}
