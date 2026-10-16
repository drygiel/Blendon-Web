// Unity key caps for a binding, or for a key sequence ("G > X > Enter"), in the Scene view's notice palette.
import { publicUrl } from '../../lib/links.ts';
import { D } from '../../plugin/window-data.ts';
import { Then } from '../blendon/tutorial/curriculum.ts';
import styles from './KeyCaps.module.scss';

// "Shift+Mouse 2" -> ["Shift", "Mouse 2"]; a lone "+" key stays a key.
const tokens = (combo: string) => combo.split(/\+(?=.)/).filter(Boolean);

/** `joined`: a "+" between the caps, where there is the width to spell the chord out. */
export function KeyCaps({
  binding,
  color,
  dim,
  joined = false,
  className,
}: {
  binding: string;
  color: string;
  dim: boolean;
  joined?: boolean;
  className?: string;
}) {
  return (
    <span className={className ?? styles.caps}>
      {binding.split(Then).flatMap((combo, s) => {
        const caps = tokens(combo).flatMap((t, i) => {
          const mouse = /^Mouse (\d)$/.exec(t);
          const name = mouse ? D.mouseIcons[Number(mouse[1])] : null;
          const url = name ? publicUrl(`plugin/icons/icon_${name.replace(/ /g, '_')}.png`) : null;
          const cap = (
            <span key={s + ':' + i} className={styles.cap + (dim ? ' ' + styles.dim : '')} style={{ color }}>
              {url ? (
                <i
                  className={styles.mouse}
                  style={{ backgroundColor: color, maskImage: `url(${url})`, WebkitMaskImage: `url(${url})` }}
                />
              ) : (
                t
              )}
            </span>
          );
          return joined && i > 0
            ? [
                <span key={s + ':+' + i} className={styles.join} style={{ color }}>
                  +
                </span>,
                cap,
              ]
            : [cap];
        });
        return s > 0
          ? [
              <span key={s + ':>'} className={styles.then} style={{ color }}>
                ›
              </span>,
              ...caps,
            ]
          : caps;
      })}
    </span>
  );
}
