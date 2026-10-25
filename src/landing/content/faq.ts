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
    a: 'No. Blendon needs Unity 6000.0 (Unity 6) or newer. Everything added after 6.0 goes through a compatibility layer, so Unity 6.0 and the newest release behave the same wherever the Editor allows it.',
  },
  {
    q: 'Will it break my Unity muscle memory?',
    a: "Only if you let it. On the Unity keyboard preset the Editor keeps every key and Blendon's gestures move aside: orbit to Ctrl+Mouse 2, pan to Alt+Mouse 2. Answer Keep Unity keys on first load and that is where you start. Or start with the Tools Only preset and switch features on as you go.",
    link: ['#pace', 'Compare the two presets.'],
  },
  {
    q: 'Do I need a numpad or a three-button mouse?',
    a: 'A numpad only for the keypad defaults of Numpad Views, Frame Selected, Isolate View and keyboard zoom, all rebindable. The View pie and the Orientation Gizmo reach the axis views without one. Orbit and pan use the middle mouse button by default, and both can be rebound to suit a trackpad.',
  },
  {
    q: 'Does it work on macOS and Linux?',
    a: 'Yes, on Windows, macOS and Linux. Key labels follow the platform, so macOS shows Cmd and Option where Windows shows Ctrl and Alt.',
  },
  {
    q: 'Which render pipelines does it support?',
    a: "All of them. Blendon draws through the Editor's own Handles and gizmo systems, so the Built-in Render Pipeline, URP and HDRP behave the same.",
  },
  {
    q: 'Does it touch my project, my builds or version control?',
    a: "Beyond its own folder, no. Blendon is Editor-only and adds nothing to player builds. Settings go to EditorPrefs and pie menus to a file in your user settings folder. Your active Shortcut Manager profile holds only keys you change, the Unity preset's keys if you pick it, and the Editor's right-click menu, which Blendon sets aside while it runs and gives back when the Editor closes. Profiles are shared by your projects, so a project without Blendon opened while a Blendon one runs, or after one crashed, has no Scene view right-click menu until a Blendon project closes normally and it is reopened. Prepare Uninstall gives it back everywhere. Editing a key on Unity's read-only Default profile asks first, then makes an editable Default copy.",
  },
  {
    q: 'Can I undo what it does?',
    a: 'Yes. Every gizmo drag, grab, box selection, reset and added object is a single undo step, and Esc or a right-click cancels a drag before it lands.',
  },
  {
    q: 'Does it get in the way of Splines, Terrain or other tools?',
    a: 'No. Tool contexts such as Splines, and tools such as Terrain painting, keep their own input, as they do without Blendon. With the Splines package installed, the Tools pie can even start Create Spline.',
  },
  {
    q: 'How is it licensed?',
    a: "Per seat, under the Unity Asset Store's standard terms: everyone who uses Blendon needs a license of their own. It is a one-time purchase.",
  },
  {
    q: 'Is it still being worked on?',
    a: 'Yes. Blendon is updated often, and updates arrive through the Package Manager like any other Asset Store package.',
  },
  {
    q: 'How do I report a bug?',
    a: 'Click Copy support info on the Overview page, or pick Tools → Blendon → Copy Support Info, and paste it into your email with what you did and what happened. It holds versions and settings only: no project path, user name or machine name.',
    link: [SUPPORT_URL, 'Email support.'],
  },
  {
    q: 'Can I get a refund?',
    a: "Yes. If Blendon doesn't suit the way you work, request a refund through the Unity Asset Store.",
  },
  {
    q: 'Is the source code included?',
    a: 'Yes, the full C# source, plus an illustrated PDF manual.',
  },
  {
    q: 'How do I remove it completely?',
    a: "While Blendon is still installed, pick Tools → Blendon → Prepare Uninstall... and confirm. It gives the Editor's Scene View menu and every command Blendon moved their keys back, takes Blendon's own keys out of your shortcut profiles and switches Blendon off until you restart the Editor. A second question asks whether to delete your Blendon settings too: every project on the machine shares them, so deleting resets every setting, the tutorial progress and the remembered window layout in all of them. Keep them if you may reinstall. Then delete the Blendon folder. Your own pie menus stay in Blendon/PieMenus.json in your user settings folder either way, until you delete that Blendon folder too.",
  },
];
