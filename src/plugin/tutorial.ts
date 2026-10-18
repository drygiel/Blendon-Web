// Shape of src/plugin/generated/tutorial.json, written by `pnpm sync` from the plugin's TutorialCurriculum.cs.
import tutorial from './generated/tutorial.json';

/** Another way through a task (TutorialTask.Otherwise), taken while the task's own way is skipped. */
export interface TutorialWay {
  /** When it is open, as the port names it: "Always", "ContextMenuAdds" or "PieOn:<shortcut id>". */
  gate: string;
  /** Shortcut whose binding the way's keys are. */
  keys: string;
  /** Its hint as written, {key:} tokens in. */
  text: string;
  picture: string;
  aspect: string;
}

export interface TutorialTask {
  id: string;
  title: string;
  /** Tokens filled for the Blendon preset with default settings, as plain text: the landing has no live keys. */
  hint: string;
  /** The hint as written, with {key:} and {setting:} tokens; absent when it has none. */
  hintSrc?: string;
  /** Public path of the hover picture. */
  picture: string;
  /** Public path of the looping clip played over the picture; empty for a still. */
  clip: string;
  /** The picture's "w / h", so a card is sized before it loads. */
  aspect: string;
  /** What the badge asks for while the task can't be ticked yet ("Select the cube first"); empty for none. */
  needs: string;
  /** How it is ticked: a shortcut pressed, a gesture's signal, a command run or a kept drag. */
  kind: 'shortcut' | 'gesture' | 'command' | 'transform';
  /** Settings page whose switch skips the task's own way. */
  page: string;
  /** Shortcut ids that tick it, the first names the keys. */
  ids?: string[];
  /** Pie item action ids and context menu keys that tick it. A trailing "/" takes any entry under it. */
  commands?: string[];
  /** The FeatureGesture that ticks it. */
  signal?: string;
  /** TransformTraits a kept drag needs, by name. */
  traits?: string[];
  /** The shortcut whose binding the keys start with. Its row is where the gear leads. */
  keysShortcut?: string;
  /** The modifier setting ("Class.Property") the keys are. */
  keysSetting?: string;
  /** The page the keys are set on, with no row to mark. */
  keysPage?: string;
  /** The keys are worked out in code (a key sequence, a modifier), not one shortcut's binding. */
  pressing?: boolean;
  /** Skipped once all of these are skipped and none is done: each leaves a scene this task works in. */
  after?: string[];
  /** The other ways through it, tried in order. */
  otherwise?: TutorialWay[];
  /** A switch below the page's own can skip it. The reason finishes "Skipped while ...". */
  availableWhen?: { reason: string };
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

export const TUTORIAL = tutorial as TutorialData;

/** Every task in curriculum order. */
export const TUTORIAL_TASKS: TutorialTask[] = TUTORIAL.chapters.flatMap((c) => c.tasks);
