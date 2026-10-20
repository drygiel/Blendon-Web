// SceneTutorial: the getting-started checklist, ticked where each gesture takes effect, in any order. One report
// ticks one task: the one picked on the settings page, else the first open one that takes it, so a gesture can
// come back later in the journey. The Scene view only gets the badge (ui/TutorialBadge.tsx), and shortcut tip
// cards lift above it.
import { PlaygroundEvents } from '../../../bridge/events.ts';
import { SharedSettings } from '../../../bridge/settings.ts';
import { Tool, Tools } from '../../unity/editor.ts';
import { SceneTutorial as Reports, type TutorialReport } from '../foundation.ts';
import { GeneralSettings } from '../settings.ts';
import { TutorialTasks, findTask, type TutorialTask } from './curriculum.ts';
import { TutorialProgress } from './progress.ts';

const ShowKey = 'GeneralSettings.ShowTutorial';

/** A tool switch reports the same key as the Tools pie item, so W, E and the toolbar count too. */
const ToolCommandPrefix = 'Blendon/Tools/';

const ToolNames: Record<number, string> = {
  [Tool.View]: 'View',
  [Tool.Move]: 'Move',
  [Tool.Rotate]: 'Rotate',
  [Tool.Scale]: 'Scale',
  [Tool.Rect]: 'Rect',
  [Tool.Transform]: 'Transform',
};

function answers(task: TutorialTask, r: TutorialReport) {
  switch (r.kind) {
    case 'signal':
      return task.signal === r.signal;
    case 'shortcut':
      return task.answers(r.id);
    case 'command':
      return task.answersCommand(r.key);
    case 'transform':
      return task.answersTransform(r.traits);
  }
}

// Needs keep a task that can't make sense yet from taking it.
const takes = (task: TutorialTask, r: TutorialReport) =>
  answers(task, r) && !TutorialProgress.isSettled(task) && task.needsMet();

// Chosen first, then curriculum order.
function offer(r: TutorialReport) {
  if (!SceneTutorial.active) return;
  const chosen = TutorialProgress.chosenId ? findTask(TutorialProgress.chosenId) : null;
  const task = chosen && takes(chosen, r) ? chosen : TutorialTasks.find((t) => takes(t, r));
  if (task) TutorialProgress.complete(task.id);
}

let installed = false;

export const SceneTutorial = {
  /** Off also pauses ticking: the switch is how a visitor who'd rather explore opts out. */
  get active() {
    return GeneralSettings.Enabled && GeneralSettings.ShowTutorial && !TutorialProgress.finished;
  },

  /** The badge is up and teaching. */
  get isShowing() {
    return SceneTutorial.active;
  },

  /** A drag only collects traits when an open task asks for one. */
  wantsTransforms() {
    return SceneTutorial.active && TutorialTasks.some((t) => t.traits && !TutorialProgress.isSettled(t));
  },

  /** The badge's close button, no questions asked: progress is kept and the settings page switches it back on. */
  skip() {
    SharedSettings.write(ShowKey, false);
  },

  /** The settings page's Start Over. */
  restart() {
    TutorialProgress.reset();
    SharedSettings.write(ShowKey, true);
  },

  install() {
    if (installed) return;
    installed = true;
    Reports.wantsTransforms = () => SceneTutorial.wantsTransforms();
    Reports.listen(offer);
    let tool = Tools.current;
    Tools.onChange(() => {
      if (Tools.current === tool) return;
      tool = Tools.current;
      const name = ToolNames[tool];
      if (name) Reports.reportCommand(ToolCommandPrefix + name);
    });
    // The dock's reset button puts every setting back, the badge's switch included.
    PlaygroundEvents.on('reset', () => TutorialProgress.reset());
  },
};
