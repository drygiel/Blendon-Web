import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import tutorialCard from '../../../assets/landing/tutorial-card.png';
import { cx } from '../../../lib/cx.ts';
import { Eyebrow, Lead, Section, SectionTitle } from '../../ui/Section.tsx';
import { TaskTip } from './TaskTip.tsx';
import { TUTORIAL, type TutorialTask } from './tutorial-data.ts';
import styles from './Tutorial.module.scss';

const CHAPTERS = TUTORIAL.chapters;
const TASK_COUNT = CHAPTERS.reduce((n, c) => n + c.tasks.length, 0);

/** How long the pointer rests on a row before its card opens, the Scene View's own wait. */
const SHOW_DELAY_MS = 500;

export function Tutorial() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [tip, setTip] = useState<{ task: TutorialTask; anchor: DOMRect } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const tipId = useId();
  const chapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0];

  const cancel = () => window.clearTimeout(timer.current);
  const show = (task: TutorialTask, el: HTMLElement) => setTip({ task, anchor: el.getBoundingClientRect() });
  const hide = () => {
    cancel();
    setTip(null);
  };

  // A fixed card would drift off its row on scroll, so it goes, as the Scene View's does on any input.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [tip]);

  useEffect(() => {
    const pending = timer;
    return () => window.clearTimeout(pending.current);
  }, []);

  const onEnter = (task: TutorialTask) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    cancel();
    timer.current = window.setTimeout(() => show(task, el), SHOW_DELAY_MS);
  };

  if (!chapter) return null;
  return (
    <Section id="tutorial">
      <div className={styles.split}>
        <div className={styles.intro}>
          <Eyebrow>05 / TUTORIAL</Eyebrow>
          <SectionTitle>Never touched Blender? The Scene view teaches you.</SectionTitle>
          <Lead>
            A checklist card walks through the gestures right in the Scene view. A task ticks off only when you actually
            perform it, not when you read about it. Progress follows you across projects.
          </Lead>
          <div className={styles.stats}>
            <span className={styles.stat}>
              <span className={styles.statValue}>{CHAPTERS.length}</span>
              <span className={styles.statLabel}>CHAPTERS</span>
            </span>
            <span className={styles.stat}>
              <span className={styles.statValue}>{TASK_COUNT}</span>
              <span className={styles.statLabel}>TASKS</span>
            </span>
          </div>
        </div>
        <div className={styles.media}>
          <div className={styles.card}>
            <img
              src={tutorialCard}
              width={619}
              height={433}
              alt="Tutorial card in the Scene view, chapter one with two of seven tasks done"
              loading="lazy"
            />
          </div>
          <div role="tablist" aria-label="Tutorial chapters" className={styles.chapters}>
            {CHAPTERS.map((c, i) => (
              <button
                key={c.title}
                type="button"
                role="tab"
                aria-selected={i === chapterIndex}
                className={cx(styles.chapter, i === chapterIndex && styles.chapterOn)}
                onClick={() => {
                  hide();
                  setChapterIndex(i);
                }}
              >
                <span className={styles.chapterNum}>{String(i + 1).padStart(2, '0')}</span>
                {c.title}
              </button>
            ))}
          </div>
          <ol role="tabpanel" aria-label={chapter.title} className={styles.tasks}>
            {chapter.tasks.map((task) => {
              const open = tip?.task.id === task.id;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className={cx(styles.task, open && styles.taskOn)}
                    aria-describedby={open ? tipId : undefined}
                    aria-expanded={open}
                    onPointerEnter={onEnter(task)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
                    onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(task, e.currentTarget)}
                    onBlur={hide}
                    // Touch has no hover: a tap opens the card and a second tap closes it.
                    onClick={(e) => (open ? hide() : show(task, e.currentTarget))}
                  >
                    <span className={styles.box} aria-hidden="true" />
                    <span>{task.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {tip && <TaskTip id={tipId} task={tip.task} anchor={tip.anchor} />}
    </Section>
  );
}
