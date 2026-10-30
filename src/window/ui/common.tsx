import { Fragment, use } from 'react';
import { type Run, capTokens } from '../core/text.ts';
import { mouseStyle } from '../core/icons.ts';
import { AppContext, useApp } from './context.ts';

export const Check = () => (
  <svg className="ck" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.4 7.3 5.9 9.7 10.6 4.5" />
  </svg>
);

export function Runs({ runs }: { runs: Run[] }) {
  const app = use(AppContext);
  // Rich text names dark-skin colours; a forced theme reads them as its own.
  const color = (s: Run['s']) => (app && s.color ? { ...s, color: app.skin(s.color) } : s);
  return runs.map((u, i) => (
    <span key={i} style={color(u.s)}>
      {u.t}
    </span>
  ));
}

/** Between the steps of a key sequence ("G > X > Enter"), drawn as a dim arrow. */
const Then = ' > ';

/** Unity key caps for a binding (KeyCap.Draw), or for a sequence of them. */
export function Caps({ binding, plus = false, tint }: { binding: string; plus?: boolean; tint?: string }) {
  const app = useApp();
  const mouse = tint ?? app.skin('#D9D9D9');
  return binding.split(Then).map((combo, s) => (
    <Fragment key={s}>
      {s > 0 && <span className="kthen">›</span>}
      {capTokens(combo).map((t, i) => (
        <Fragment key={i}>
          {plus && i > 0 && <span className="kplus">+</span>}
          <span className={'ukc' + (t.mouse ? ' ms' : '')} style={tint ? { color: tint } : undefined}>
            {t.t}
            {t.mouse && <span className="msi" style={mouseStyle(t.icon, mouse)} />}
          </span>
        </Fragment>
      ))}
    </Fragment>
  ));
}
