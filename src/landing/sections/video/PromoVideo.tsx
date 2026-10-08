import { useRef, useState } from 'react';
import coverWidths from '../../../assets/landing/promo-cover.jpg?w=640;960;1280&format=webp&as=meta:src;width';
import { useReducedMotion } from '../../../lib/hooks.ts';
import { responsive } from '../../../lib/images.ts';
import { PROMO_VIDEO_ID } from '../../../lib/links.ts';
import { plotAnchor } from '../../plotter/contract.ts';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './PromoVideo.module.scss';

const TITLE = 'Blendon - Unity 6 Plugin';
// The video's YouTube cover, served from here so the page asks YouTube for nothing until it plays.
const COVER = responsive(coverWidths);

/** The promo video. YouTube's player loads only once it is asked to play. */
export function PromoVideo() {
  const [playing, setPlaying] = useState(false);
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
      <div ref={player} className={styles.player} {...plotAnchor('video-player')} data-reveal="print">
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
              src={COVER.src}
              srcSet={COVER.srcSet}
              sizes="(max-width: 1240px) calc(100vw - 56px), 1184px"
              alt=""
              width={1280}
              height={720}
              loading="lazy"
              decoding="async"
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
