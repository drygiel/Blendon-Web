import { useRef, useState } from 'react';
import { useReducedMotion } from '../../../lib/hooks.ts';
import { PROMO_VIDEO_ID } from '../../../lib/links.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './PromoVideo.module.scss';

const TITLE = 'Blendon - Unity 6 Plugin';
// YouTube only has a full-resolution cover for some uploads; the smaller ones always exist.
const POSTERS = ['maxresdefault', 'sddefault', 'hqdefault'].map(
  (q) => `https://i.ytimg.com/vi/${PROMO_VIDEO_ID}/${q}.jpg`,
);

/** The promo video. YouTube's player loads only once it is asked to play. */
export function PromoVideo() {
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState(0);
  const player = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });

  return (
    <Section id="video" plate="frustum" route="camera">
      <SectionIntro
        eyebrow="01 / VIDEO"
        title={
          <>
            See it in <em>motion.</em>
          </>
        }
        lead="A short tour of Blendon in the Unity 6 Scene view."
      />
      <div ref={player} className={styles.player} data-plot-anchor="video-player" data-reveal="print">
        {playing ? (
          <iframe
            className={styles.frame}
            src={`https://www.youtube-nocookie.com/embed/${PROMO_VIDEO_ID}?${params}`}
            title={TITLE}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className={styles.cover}
            onClick={() => {
              setPlaying(true);
              player.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
            }}
            aria-label={`Play ${TITLE}`}
          >
            <img
              className={styles.poster}
              src={POSTERS[poster]}
              alt=""
              loading="lazy"
              // A missing cover still answers, with YouTube's 120 x 90 placeholder.
              onLoad={(e) => e.currentTarget.naturalWidth < 200 && poster < POSTERS.length - 1 && setPoster(poster + 1)}
              onError={() => poster < POSTERS.length - 1 && setPoster(poster + 1)}
            />
            <span className={styles.play} aria-hidden="true">
              <svg width="30" height="34" viewBox="0 0 30 34">
                <path d="M3 2.5v29L28 17z" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.note}>Plays on YouTube</span>
          </button>
        )}
      </div>
    </Section>
  );
}
