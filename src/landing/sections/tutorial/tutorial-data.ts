// Shape of src/generated/tutorial.json, written by `pnpm sync` from the plugin's TutorialCurriculum.cs.
import tutorial from '../../../generated/tutorial.json';

export interface TutorialTask {
  id: string;
  title: string;
  hint: string;
  /** Public path of the hover picture. */
  picture: string;
  /** Public path of the looping clip played over the picture; empty for a still. */
  clip: string;
}

export interface TutorialChapter {
  title: string;
  subtitle: string;
  tasks: TutorialTask[];
}

export interface TutorialData {
  chapters: TutorialChapter[];
}

export const TUTORIAL: TutorialData = tutorial;

const byId = new Map(TUTORIAL.chapters.flatMap((c) => c.tasks.map((t) => [t.id, t] as const)));

/** A task's hover picture and clip, by the id the playground's curriculum shares. */
export const tutorialTip = (id: string): TutorialTask | undefined => byId.get(id);
