import { Fragment } from 'react';
import { type Run, capTokens } from '../core/text.ts';
import { mouseStyle } from '../core/icons.ts';

export const Check = () => (
  <svg className="ck" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.4 7.3 5.9 9.7 10.6 4.5" />
  </svg>
);

export function Runs({ runs }: { runs: Run[] }) {
  return runs.map((u, i) => (
    <span key={i} style={u.s}>
      {u.t}
    </span>
  ));
}

/** Unity key caps for a binding (KeyCap.Draw). */
export function Caps({ binding, plus = false }: { binding: string; plus?: boolean }) {
  return capTokens(binding).map((t, i) => (
    <Fragment key={i}>
      {plus && i > 0 && <span className="kplus">+</span>}
      <span className={'ukc' + (t.mouse ? ' ms' : '')}>
        {t.t}
        {t.mouse && <span className="msi" style={mouseStyle(t.icon)} />}
      </span>
    </Fragment>
  ));
}
