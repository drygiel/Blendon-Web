// A picture from the icon sprite in place of an <img>; see sprite-sheet.ts.
import type { HTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { spriteBackground } from './sprite-sheet.ts';
import styles from './Sprite.module.scss';

type SpriteProps = {
  name: string;
  /** Width and height; leave out to size it from `className`. */
  size?: number;
  /** Set for a picture that means something; without it the picture is decoration. */
  label?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function Sprite({ name, size, label, className, style, ...rest }: SpriteProps) {
  return (
    <span
      {...rest}
      className={cx(styles.sprite, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ width: size, height: size, ...spriteBackground(name), ...style }}
    />
  );
}
