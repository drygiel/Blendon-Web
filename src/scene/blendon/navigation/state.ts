// ViewNavigationState: whether the camera is under the user's hand right now.
import { OrbitSelected } from './orbit-selected.ts';
import { Pan } from './pan.ts';
import { QuickRoll } from './quick-roll.ts';
import { ViewOrbitTween } from './camera.ts';
import { GizmoDragController } from './orientation/drag-controller.ts';

export const ViewNavigationState = {
  get inProgress() {
    return (
      OrbitSelected.isOrbiting ||
      QuickRoll.isRolling ||
      Pan.isPanning ||
      ViewOrbitTween.isPlaying ||
      GizmoDragController.anyDragging
    );
  },
};
