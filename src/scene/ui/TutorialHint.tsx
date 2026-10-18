// A tutorial hint as the Editor draws it with rich text: keys bold in the cards' key colour, a missing one dim.
import { hintRuns } from '../blendon/tutorial/hint.ts';

// Tip.KeyOpen and Tip.NoKey's colours.
const KeyStyle = { color: '#D98E38', fontWeight: 700 } as const;
const NoKeyStyle = { color: '#92929A' } as const;

/** `text`: a resolved hint (TutorialTask.hint). */
export function TutorialHint({ text }: { text: string }) {
  return (
    <>
      {hintRuns(text).map((r, i) =>
        r.key ? (
          <b key={i} style={KeyStyle}>
            {r.t}
          </b>
        ) : r.none ? (
          <span key={i} style={NoKeyStyle}>
            {r.t}
          </span>
        ) : (
          r.t
        ),
      )}
    </>
  );
}
