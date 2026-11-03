// The FAQ, repeated in the page's structured data.
import { SUPPORT_URL } from '../../lib/links.ts';

export interface FaqEntry {
  q: string;
  /** Plain text: the page shows it and the structured data repeats it. */
  a: string;
  /** A link shown after the answer: [href, label]. */
  link?: [string, string];
}

export const FAQ: FaqEntry[] = [
  {
    q: 'Does it work in Unity 2022 LTS or older?',
    a: 'No. Blendon needs Unity 6000.0 (Unity 6) or newer, and behaves the same on 6.0 and the newest release wherever the Editor allows it.',
  },
  {
    q: 'Will it break my Unity muscle memory?',
    a: 'Only if you let it. Pick Keep Unity keys on first load: the Editor keeps every key, orbit moves to Ctrl+Mouse 2 and pan to Alt+Mouse 2. Or start with the Tools Only preset and switch features on as you go.',
    link: ['#pace', 'Compare the two presets.'],
  },
  {
    q: 'Do I need a numpad or a three-button mouse?',
    a: 'A numpad only for the defaults of Numpad Views, Frame Selected, Isolate View and keyboard zoom, all rebindable. The View pie and the Orientation Gizmo reach the axis views without one. Orbit and pan default to the middle mouse button, rebindable for a trackpad.',
  },
  {
    q: 'Does it work on macOS and Linux?',
    a: 'Yes, on Windows, macOS and Linux. Key labels follow the platform: macOS shows Cmd and Option where Windows shows Ctrl and Alt.',
  },
  {
    q: 'Which render pipelines does it support?',
    a: 'All of them: the Built-in Render Pipeline, URP and HDRP behave the same.',
  },
  {
    q: 'Does it touch my project, my builds or version control?',
    a: "Only its own folder. Blendon is Editor-only and adds nothing to player builds. It writes settings to EditorPrefs, pie menus to your user settings folder, and to your active Shortcut Manager profile only keys you change, your preset's keys and the Editor's right-click menu, which it sets aside while it runs and gives back when the Editor closes. Projects share profiles, so a project without Blendon, opened while a Blendon project runs or after one crashed, lacks the Scene view right-click menu until a Blendon project closes normally and the other is reopened. Prepare Uninstall gives it back everywhere. Editing a key on Unity's read-only Default profile asks first, then makes an editable Default copy.",
  },
  {
    q: 'Can I undo what it does?',
    a: 'Yes. Every gizmo drag, grab, box selection, reset and added object is one undo step, and Esc or a right-click cancels a drag before it lands.',
  },
  {
    q: 'Does it get in the way of Splines, Terrain or other tools?',
    a: 'No. Tool contexts such as Splines and tools such as Terrain painting keep their own input. With the Splines package installed, the Tools pie can start Create Spline.',
  },
  {
    q: 'How is it licensed?',
    a: "Per seat, under the Unity Asset Store's standard terms: each user needs their own license. It is a one-time purchase.",
  },
  {
    q: 'Is it still being worked on?',
    a: 'Yes. Updates come often, through the Package Manager like any Asset Store package.',
  },
  {
    q: 'How do I report a bug?',
    a: 'Click Copy support info on the Overview page, or pick Tools → Blendon → Copy Support Info, and email it with what you did and what happened. It holds only versions and settings, no project path, user name or machine name.',
    link: [SUPPORT_URL, 'Email support.'],
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes, through the Unity Asset Store.',
  },
  {
    q: 'Is the source code included?',
    a: 'Yes, the full C# source, plus an illustrated PDF manual.',
  },
  {
    q: 'How do I remove it completely?',
    a: "While Blendon is still installed, pick Tools → Blendon → Prepare Uninstall... and confirm. It gives back the Editor's Scene View menu and the keys of every command Blendon moved, takes Blendon's keys out of your shortcut profiles and switches Blendon off until the Editor restarts. A second question asks whether to delete your Blendon settings too. All projects on the machine share them, so this resets every setting, the tutorial progress and the remembered window layout everywhere. Keep them if you may reinstall. Then delete the Blendon folder. Your pie menus stay in Blendon/PieMenus.json in your user settings folder until you delete that folder too.",
  },
];
