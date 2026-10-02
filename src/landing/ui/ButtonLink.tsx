import type { ReactNode } from 'react';
import styles from './Button.module.scss';

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  small?: boolean;
}

export function ButtonLink({ href, children, variant = 'primary', small = false }: ButtonLinkProps) {
  const cls = [styles.button, styles[variant], small && styles.small].filter(Boolean).join(' ');
  return (
    <a className={cls} href={href}>
      {children}
    </a>
  );
}
