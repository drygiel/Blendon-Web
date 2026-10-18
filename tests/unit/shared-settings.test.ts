import { describe, expect, it } from 'vitest';
import { PlaygroundEvents } from '../../src/bridge/events.ts';
import { SharedSettings } from '../../src/bridge/settings.ts';

const Key = 'GeneralSettings.ShowTutorial';

describe('a setting the Scene view writes', () => {
  it('waits for the window when written before it loaded, and goes to it once it has', () => {
    const sent: unknown[] = [];
    const stop = PlaygroundEvents.on('setSetting', (d) => sent.push(d));
    let heard = 0;
    const unsubscribe = SharedSettings.subscribe(() => heard++);

    // The dock's reset drops a value the window never took over.
    SharedSettings.write(Key, false);
    PlaygroundEvents.emit('reset');
    expect(SharedSettings.val(Key)).toBeUndefined();

    // The badge closed before the window mounted: the Scene view reads it at once.
    SharedSettings.write(Key, false);
    expect(SharedSettings.val(Key)).toBe(false);
    expect(SharedSettings.early).toEqual({ [Key]: false });
    expect(heard).toBe(3);
    expect(sent).toEqual([]);

    // The window starts from it and publishes; later writes go to the window.
    SharedSettings.publish({ val: (k) => (k === Key ? false : undefined), shortcut: () => '', pieOn: () => true });
    expect(SharedSettings.early).toEqual({});
    SharedSettings.write(Key, true);
    expect(sent).toEqual([{ key: Key, value: true }]);
    stop();
    unsubscribe();
  });
});
