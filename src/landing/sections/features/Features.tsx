import { useRef, useState } from 'react';
import { useInView, useReducedMotion } from '../../../lib/hooks.ts';
import { cx } from '../../../lib/cx.ts';
import { FEATURE_GROUPS, FEATURES, posterOf, type FeatureGroupId } from '../../data/content.ts';
import { plotPart } from '../../plotter/contract.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { PickButton } from '../../ui/PickButton.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Features.module.scss';

const videoUrl = (clip: string) => `${import.meta.env.BASE_URL}plugin/video/${clip}.mp4`;
// The player's width: the page column beside the 380px list, or the whole column once they stack.
const PLAYER_SIZES = '(max-width: 900px) calc(100vw - 56px), (max-width: 1240px) calc(100vw - 464px), 776px';

export function Features() {
  const [group, setGroup] = useState<FeatureGroupId>('nav');
  const [featureId, setFeatureId] = useState<string | null>(null);
  const inGroup = FEATURES.filter((f) => f.group === group);
  const cur = inGroup.find((f) => f.id === featureId) ?? inGroup[0];

  const panel = useRef<HTMLDivElement>(null);
  // The clips are large: nothing downloads until the player comes near the viewport.
  const near = useInView(panel, { margin: '400px', once: true });
  const reduced = useReducedMotion();
  // Native controls paint over the image under the video, so with them the video takes the loaded file as its poster.
  const [shownPoster, setShownPoster] = useState<string>();

  if (!cur) return null;
  const poster = posterOf(cur.clip);
  return (
    <Section id="features" className={styles.section} plate="sphere" route="split">
      <SectionIntro
        eyebrow="03 / FEATURES"
        title={
          <>
            Everything your hands <em>already expect.</em>
          </>
        }
        lead="Navigation, gizmos, scene tools and menus, each tuned from one settings window: Tools → Blendon. Pick a feature to watch it run."
      />

      <div
        role="tablist"
        aria-label="Feature groups"
        className={styles.tabs}
        data-reveal="stagger"
        {...plotPart('above')}
      >
        {FEATURE_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === group}
            className={cx(styles.tab, g.id === group && styles.tabOn)}
            onClick={() => {
              setGroup(g.id);
              setFeatureId(null);
            }}
          >
            <span>{g.label}</span>
            <span className={styles.count}>{FEATURES.filter((f) => f.group === g.id).length}</span>
          </button>
        ))}
      </div>

      <div className={styles.explorer}>
        <div className={styles.list} data-reveal="stagger" {...plotPart('left')}>
          {inGroup.map((f) => (
            <PickButton
              key={f.id}
              selected={f.id === cur.id}
              onPick={() => setFeatureId(f.id)}
              hold
              title={f.title}
              aside={<Keys tokens={f.keys} size="sm" end />}
            />
          ))}
        </div>

        <div ref={panel} className={styles.player} data-reveal="print" {...plotPart('right')}>
          <div className={styles.screen}>
            <img
              className={styles.poster}
              src={poster.src}
              srcSet={poster.srcSet}
              sizes={PLAYER_SIZES}
              alt=""
              width={1280}
              height={720}
              loading="lazy"
              decoding="async"
              onLoad={(e) => setShownPoster(e.currentTarget.currentSrc)}
            />
            <video
              src={near ? videoUrl(cur.clip) : undefined}
              poster={reduced ? shownPoster : undefined}
              autoPlay={!reduced}
              controls={reduced}
              muted
              loop
              playsInline
              preload={near ? 'auto' : 'none'}
              aria-label={`${cur.title} demo loop`}
            />
          </div>
          <div className={styles.caption}>
            <h3 className={styles.title}>{cur.title}</h3>
            <Keys tokens={cur.keys} className={styles.keys} />
          </div>
          <p className={styles.desc}>{cur.desc}</p>
        </div>
      </div>
    </Section>
  );
}
