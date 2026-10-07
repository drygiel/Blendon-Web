import { useRef, useState } from 'react';
import { useInView, useReducedMotion } from '../../../lib/hooks.ts';
import { cx } from '../../../lib/cx.ts';
import { FEATURE_GROUPS, FEATURES, type FeatureGroupId } from '../../data/content.ts';
import { Keys } from '../../ui/KeyCap.tsx';
import { PickButton } from '../../ui/PickButton.tsx';
import { Section, SectionIntro } from '../../ui/Section.tsx';
import styles from './Features.module.scss';

const videoUrl = (clip: string) => `${import.meta.env.BASE_URL}plugin/video/${clip}.mp4`;

export function Features() {
  const [group, setGroup] = useState<FeatureGroupId>('nav');
  const [featureId, setFeatureId] = useState<string | null>(null);
  const inGroup = FEATURES.filter((f) => f.group === group);
  const cur = inGroup.find((f) => f.id === featureId) ?? inGroup[0];

  const panel = useRef<HTMLDivElement>(null);
  // The clips are large: nothing downloads until the player comes near the viewport.
  const near = useInView(panel, { margin: '400px', once: true });
  const reduced = useReducedMotion();

  if (!cur) return null;
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

      <div role="tablist" aria-label="Feature groups" className={styles.tabs} data-reveal="stagger">
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
        <div className={styles.list} data-reveal="stagger" data-plot-col="left">
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

        <div ref={panel} className={styles.player} data-reveal="print" data-plot-col="right">
          <video
            className={styles.video}
            src={near ? videoUrl(cur.clip) : undefined}
            poster={cur.poster}
            autoPlay={!reduced}
            controls={reduced}
            muted
            loop
            playsInline
            preload={near ? 'auto' : 'none'}
            aria-label={`${cur.title} demo loop`}
          />
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
