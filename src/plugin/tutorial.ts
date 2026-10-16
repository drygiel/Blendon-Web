// Shape of src/plugin/generated/tutorial.json, written by `pnpm sync` from the plugin's TutorialCurriculum.cs.
import tutorial from './generated/tutorial.json';

export interface TutorialTask {
  id: string;
  title: string;
  hint: string;
  /** Public path of the hover picture. */
  picture: string;
  /** Public path of the looping clip played over the picture; empty for a still. */
  clip: string;
  /** The picture's "w / h", so a card is sized before it loads. */
  aspect: string;
  /** What the badge asks for while the task can't be ticked yet ("Select the cube first"); empty for none. */
  needs: string;
}

export interface TutorialChapter {
  title: string;
  subtitle: string;
  /** Editor icon name. */
  icon: string;
  /** The chapter's page colour. */
  accent: string;
  tasks: TutorialTask[];
}

export interface TutorialData {
  chapters: TutorialChapter[];
}

export const TUTORIAL: TutorialData = tutorial;

/** Every task in curriculum order. */
export const TUTORIAL_TASKS: TutorialTask[] = TUTORIAL.chapters.flatMap((c) => c.tasks);
