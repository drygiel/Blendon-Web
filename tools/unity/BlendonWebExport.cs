// Exports what the website's settings window needs from a running Unity Editor: every settings
// page's properties, labels, tooltips and defaults, the shortcut tables, the pie menus and the
// editor icons the pages draw. `pnpm sync` turns the result into src/generated/window-data.json.
//
// Use: copy this file into any Editor folder of a project that has Blendon installed, run
// Tools > Blendon > Export Web Data, then delete it again. Everything is read through reflection,
// so it compiles without referencing Blendon's assemblies and touches none of its settings.
#nullable enable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace Blendon.WebTools
{
    public static class BlendonWebExport
    {
        const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static |
                                 BindingFlags.Instance;

        // Used by the site but never named in Blendon's own sources.
        static readonly string[] ExtraIcons = { "d_EyeDropper.Large" };

        [MenuItem("Tools/Blendon/Export Web Data")]
        static void ExportFromMenu()
        {
            var dir = Export(DefaultOutput());
            EditorUtility.RevealInFinder(Path.Combine(dir, "model.json"));
        }

        /// <summary>Blendon's own Metadata~/PlaygroundRef folder, which `pnpm sync` reads.</summary>
        public static string DefaultOutput()
        {
            var asmdef = CompilationPipeline.GetAssemblyDefinitionFilePathFromAssemblyName("Blendon.Editor");
            if (string.IsNullOrEmpty(asmdef)) throw new InvalidOperationException("Blendon is not in this project");

            var editor = Path.GetDirectoryName(Path.GetFullPath(asmdef))!;
            return Path.Combine(Path.GetDirectoryName(editor)!, "Metadata~", "PlaygroundRef");
        }

        /// <summary>Writes model.json, model2.json, model3.json and ui/ into <paramref name="dir" />.</summary>
        public static string Export(string dir)
        {
            Directory.CreateDirectory(dir);
            var pages = Pages().ToList();

            Write(Path.Combine(dir, "model.json"), new Dictionary<string, object?> { ["pages"] = PageModels(pages) });
            Write(Path.Combine(dir, "model2.json"), new Dictionary<string, object?>
            {
                ["consts"]        = Constants(),
                ["pageShortcuts"] = PageShortcuts(),
                ["known"]         = Contested(),
                ["featureTips"]   = FeatureTips()
            });
            Write(Path.Combine(dir, "model3.json"), new Dictionary<string, object?>
            {
                ["pies"]            = Pies(),
                ["extras"]          = SceneMenuExtras(),
                ["frameSteps"]      = FrameSteps(pages),
                ["tutorialStatus"]  = Call(Type("Blendon.Editor.SettingsWindow.OverviewPage"), "TutorialStatus"),
                ["modifierLabels"]  = Get(Type("Blendon.Editor.Common.ModifierKeys"), "OptionLabels"),
                ["modifierOptions"] = Names((IEnumerable)Get(Type("Blendon.Editor.Common.ModifierKeys"), "Options")!),
                ["enums"]           = Enums(),
                ["layers"]          = Layers()
            });
            Icons(Path.Combine(dir, "ui"));

            Debug.Log("Blendon web data exported to " + dir);
            return dir;
        }

        // ---- settings pages ------------------------------------------------------------------------

        /// <summary>Every page's settings object, then the parts it nests (the Transform tool's three).</summary>
        static IEnumerable<object> Pages()
        {
            var seen = new HashSet<Type>();
            var stack = new Stack<object>();
            foreach (var page in ((IEnumerable)Get(Type("Blendon.Editor.SettingsWindow.SettingsPages"), "Pages")!)
                     .Cast<object>().Reverse())
                stack.Push(page);

            while (stack.Count > 0)
            {
                var settings = stack.Pop();
                if (!seen.Add(settings.GetType())) continue;

                yield return settings;
                foreach (var nested in ((IEnumerable)Get(settings, "Nested")!).Cast<object>().Reverse())
                    stack.Push(nested);
            }
        }

        static List<object?> PageModels(IEnumerable<object> pages)
        {
            var settingAttr = Type("Blendon.Editor.Settings.SettingAttribute");
            var settingsBase = Type("Blendon.Editor.Settings.SettingsBase");
            var defaultOf = settingsBase.GetMethod("DefaultOf", All, null, new[] { typeof(PropertyInfo) }, null)!;
            var tipOf = settingsBase.GetMethod("TipOf", All, null, new[] { typeof(PropertyInfo) }, null)!;
            var delegateTarget = settingsBase.GetMethod("DelegateTarget", All, null, new[] { typeof(PropertyInfo) }, null)!;

            var list = new List<object?>();
            foreach (var settings in pages)
            {
                var type = settings.GetType();
                var props = new List<object?>();
                foreach (var p in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                {
                    // A property another page stores (the Transform tool's parts) is listed on that page.
                    var attr = p.GetCustomAttribute(settingAttr);
                    if (attr == null || delegateTarget.Invoke(settings, new object[] { p }) != null) continue;

                    var prop = new Dictionary<string, object?>
                    {
                        ["name"]    = p.Name,
                        ["ptype"]   = p.PropertyType.Name,
                        ["label"]   = Get(attr, "Label"),
                        ["icon"]    = Get(attr, "IconName"),
                        ["tip"]     = Card(tipOf.Invoke(settings, new object[] { p })),
                        ["value"]   = Plain(p.GetValue(settings)),
                        ["default"] = Plain(defaultOf.Invoke(settings, new object[] { p }))
                    };
                    if (p.PropertyType.IsEnum) prop["options"] = Enum.GetNames(p.PropertyType);
                    props.Add(prop);
                }

                var page = new Dictionary<string, object?>
                {
                    ["type"]      = type.Name,
                    ["switchTip"] = Card(Get(settings, "SwitchTip"))
                };
                if (Get(settings, "Header") is { } header) page["header"] = Header(header);
                page["props"] = props;
                list.Add(page);
            }

            return list;
        }

        static Dictionary<string, object?> Header(object header)
        {
            var sections = ((IEnumerable)Get(header, "Sections")!).Cast<object>()
                .Select(s => (object?)new List<object?> { Get(s, "Item1"), Get(s, "Item2") }).ToList();
            var keys = ((IEnumerable)Get(header, "Keys")!).Cast<object>().Select(k => (object?)new Dictionary<string, object?>
            {
                ["action"]   = Get(k, "Action"),
                ["active"]   = Get(k, "IsActive"),
                ["bindings"] = ((IEnumerable)Get(k, "Bindings")!).Cast<Func<string>>().Select(b => (object?)b()).ToList()
            }).ToList();

            return new Dictionary<string, object?>
            {
                ["image"]    = Get(header, "Image"),
                ["video"]    = Get(header, "Video"),
                ["footer"]   = Get(header, "Footer"),
                ["sections"] = sections,
                ["keys"]     = keys
            };
        }

        // ---- shortcuts and the Overview ------------------------------------------------------------

        /// <summary>Every string constant in Blendon, by "Type.Name": tooltips, notes and captions the pages draw.</summary>
        static Dictionary<string, object?> Constants()
        {
            var map = new Dictionary<string, object?>();
            foreach (var type in BlendonTypes().OrderBy(t => t.FullName, StringComparer.Ordinal))
            foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static |
                                             BindingFlags.DeclaredOnly))
                if (f.IsLiteral && f.FieldType == typeof(string))
                    map.TryAdd(type.Name + "." + f.Name, f.GetRawConstantValue());

            return map;
        }

        static Dictionary<string, object?> PageShortcuts()
        {
            var pages = Type("Blendon.Editor.SettingsWindow.SettingsPages");
            var state = Type("Blendon.Editor.Shortcuts.ShortcutState");
            var names = Type("Blendon.Editor.Shortcuts.ShortcutNames");
            var tips = Type("Blendon.Editor.SettingsWindow.OverviewTips");

            var map = new Dictionary<string, object?>();
            foreach (var page in Enum.GetValues(Type("Blendon.Editor.Settings.SettingsPage")))
            {
                var ids = ((IEnumerable)Call(pages, "ShortcutIds", page)!).Cast<string>().Select(id =>
                    (object?)new Dictionary<string, object?>
                    {
                        ["id"]   = id,
                        ["name"] = Call(names, "Of", id),
                        ["text"] = Call(state, "Text", id),
                        ["tip"]  = Card(Call(tips, "Shortcut", id))
                    }).ToList();

                map[page.ToString()] = new Dictionary<string, object?>
                {
                    ["enabled"] = Call(pages, "IsEnabled", page),
                    ["full"]    = Call(pages, "IsFullyEnabled", page),
                    ["primary"] = Call(pages, "PrimaryShortcut", page),
                    ["ids"]     = ids
                };
            }

            return map;
        }

        /// <summary>The keys Blendon and the Editor both want, with where each side moves when it gives way.</summary>
        static List<object?> Contested()
        {
            var state = Type("Blendon.Editor.Shortcuts.ShortcutState");
            var known = (IEnumerable)Get(Type("Blendon.Editor.Shortcuts.ShortcutProfileSetup"), "Known")!;

            return known.Cast<object>().Select(row => (object?)new Dictionary<string, object?>
            {
                ["row"]         = Members(row),
                ["unityText"]   = Call(state, "Text", Get(row, "UnityId")),
                ["unityMove"]   = Plain(Get(row, "_unityMove")),
                ["blendonMove"] = Plain(Get(row, "_blendonMove"))
            }).ToList();
        }

        static Dictionary<string, object?> FeatureTips()
        {
            var tips = Type("Blendon.Editor.SettingsWindow.OverviewTips");
            var map = new Dictionary<string, object?>();
            foreach (var info in (IEnumerable)Get(Type("Blendon.Editor.Settings.PageCatalog"), "All")!)
                map[(string)Get(info, "Label")!] = Card(Call(tips, "Feature", info), true);

            return map;
        }

        // ---- pie menus, context menu, Frame Selected -----------------------------------------------

        static List<object?> Pies()
        {
            var store = Get(Type("Blendon.Editor.PieMenus.PieMenuStore"), "Instance")!;
            var tips = Type("Blendon.Editor.PieMenus.BuiltInPieTips");
            var list = Type("Blendon.Editor.PieMenus.PieMenuListSettings");
            var state = Type("Blendon.Editor.Shortcuts.ShortcutState");

            var pies = new List<object?>();
            foreach (var d in (IEnumerable)Get(Type("Blendon.Editor.PieMenus.BuiltInPies"), "All")!)
            {
                var id = (string)Get(d, "Id")!;
                var shortcutId = (string)Get(d, "ShortcutId")!;
                var def = Call(store, "ById", id);
                var items = def == null
                    ? new List<object>()
                    : ((IEnumerable)Get(def, "Items")!).Cast<object>().ToList();

                pies.Add(new Dictionary<string, object?>
                {
                    ["id"]         = id,
                    ["title"]      = def != null ? Get(def, "Title") : Get(d, "Name"),
                    ["enabled"]    = def == null || (bool)Get(def, "Enabled")!,
                    ["builtIn"]    = true,
                    ["icon"]       = Get(d, "IconName"),
                    ["desc"]       = Get(d, "Description"),
                    ["shortcutId"] = shortcutId,
                    ["text"]       = Call(state, "Text", shortcutId),
                    ["filled"]     = items.Count(i => !string.IsNullOrEmpty((string?)Get(i, "Target"))),
                    ["items"]      = items.Select(i => (object?)$"{Get(i, "Label")}|{Get(i, "Target")}|{Get(i, "IconName")}").ToList(),
                    ["tipGet"]     = Card(Call(tips, "Get", id)),
                    ["tipRow"]     = Card(Call(tips, "Row", id))
                });
            }

            return pies;
        }

        static List<object?> SceneMenuExtras()
        {
            var ordered = (IEnumerable)Call(Type("Blendon.Editor.SceneTools.SceneMenuCatalog"), "Ordered")!;
            return ordered.Cast<object>().Select(g => (object?)Members(g)).ToList();
        }

        static List<object?> FrameSteps(IEnumerable<object> pages)
        {
            var settings = pages.First(p => p.GetType().Name == "FrameSelectedSettings");
            return ((IEnumerable)Get(settings, "Steps")!).Cast<object>()
                .Select(s => (object?)new List<object?> { Get(s, "Item1")!.ToString(), Get(s, "Item2") }).ToList();
        }

        // ---- enums, layers ---------------------------------------------------------------------------

        static Dictionary<string, object?> Enums()
        {
            var map = new Dictionary<string, object?>();
            foreach (var type in BlendonTypes().Where(t => t.IsEnum).OrderBy(t => t.FullName, StringComparer.Ordinal))
                map.TryAdd(type.Name, Enum.GetNames(type)
                    .Select(n => (object?)new List<object?> { n, ObjectNames.NicifyVariableName(n) }).ToList());

            return map;
        }

        static List<object?> Layers()
        {
            var list = new List<object?>();
            for (var i = 0; i < 32; i++)
                if (LayerMask.LayerToName(i) is { Length: > 0 } name)
                    list.Add(i + ":" + name);

            return list;
        }

        // ---- editor icons ----------------------------------------------------------------------------

        /// <summary>
        ///     Every string in Blendon's sources that names an editor icon, saved as PNG at its @2x size,
        ///     plus ui.json mapping each name to "file:WxH".
        /// </summary>
        static void Icons(string dir)
        {
            Directory.CreateDirectory(dir);
            var root = Path.GetDirectoryName(Path.GetDirectoryName(DefaultOutput()))!;
            var literal = new Regex("\"([A-Za-z_][A-Za-z0-9_ .@-]{1,59})\"");
            var names = new SortedSet<string>(ExtraIcons, StringComparer.Ordinal);
            foreach (var file in Directory.GetFiles(Path.Combine(root, "Editor"), "*.cs", SearchOption.AllDirectories))
            foreach (Match m in literal.Matches(File.ReadAllText(file)))
                names.Add(m.Groups[1].Value);

            var map = new SortedDictionary<string, object?>(StringComparer.Ordinal);
            var logging = Debug.unityLogger.logEnabled;
            Debug.unityLogger.logEnabled = false;
            try
            {
                foreach (var name in names)
                {
                    var tex = Resolve(name);
                    if (tex == null) continue;

                    var file = "icon_" + name.Replace(" ", "_").Replace("@", "_at_") + ".png";
                    File.WriteAllBytes(Path.Combine(dir, file), Png(tex));
                    map[name] = file + ":" + tex.width + "x" + tex.height;
                }
            }
            finally
            {
                Debug.unityLogger.logEnabled = logging;
            }

            Write(Path.Combine(dir, "ui.json"), new Dictionary<string, object?> { ["icons"] = map });
        }

        // The @2x variant first, so the export does not depend on the display the editor runs on.
        static Texture? Resolve(string name)
        {
            foreach (var candidate in name.Contains("@") ? new[] { name } : new[] { name + "@2x", name })
            {
                try
                {
                    if (EditorGUIUtility.IconContent(candidate)?.image is { } image) return image;
                }
                catch
                {
                    // A malformed name throws rather than returning empty content.
                }
            }

            return EditorGUIUtility.FindTexture(name);
        }

        /// <summary>A GPU-only icon read back through a render target, colour space preserved.</summary>
        static byte[] Png(Texture tex)
        {
            var rt = RenderTexture.GetTemporary(tex.width, tex.height, 0, RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB);
            var previous = RenderTexture.active;
            var copy = new Texture2D(tex.width, tex.height, TextureFormat.RGBA32, false, false);
            try
            {
                Graphics.Blit(tex, rt);
                RenderTexture.active = rt;
                copy.ReadPixels(new Rect(0, 0, tex.width, tex.height), 0, 0);
                copy.Apply();
                return copy.EncodeToPNG();
            }
            finally
            {
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(rt);
                UnityEngine.Object.DestroyImmediate(copy);
            }
        }

        // ---- reflection --------------------------------------------------------------------------------

        static HashSet<string>? _assemblies;

        /// <summary>The assemblies of the asmdefs in Blendon's Editor folder: the plugin, not its tests or tools.</summary>
        static HashSet<string> PluginAssemblies()
        {
            if (_assemblies != null) return _assemblies;

            var root = Path.GetDirectoryName(Path.GetDirectoryName(DefaultOutput()))!;
            var name = new Regex("\"name\"\\s*:\\s*\"([^\"]+)\"");
            return _assemblies = new HashSet<string>(Directory
                .GetFiles(Path.Combine(root, "Editor"), "*.asmdef", SearchOption.AllDirectories)
                .Select(f => name.Match(File.ReadAllText(f)).Groups[1].Value));
        }

        static IEnumerable<Type> BlendonTypes()
        {
            var names = PluginAssemblies();
            return AppDomain.CurrentDomain.GetAssemblies()
                .Where(a => names.Contains(a.GetName().Name))
                .SelectMany(a =>
                {
                    try
                    {
                        return (IEnumerable<Type>)a.GetTypes();
                    }
                    catch (ReflectionTypeLoadException e)
                    {
                        return e.Types.Where(t => t != null).Cast<Type>();
                    }
                });
        }

        static Type Type(string fullName)
        {
            return BlendonTypes().FirstOrDefault(t => t.FullName == fullName)
                   ?? throw new InvalidOperationException("Blendon type not found: " + fullName);
        }

        /// <summary>A property or field of an object, or a static one when <paramref name="target" /> is a Type.</summary>
        static object? Get(object target, string name)
        {
            var type = target as Type ?? target.GetType();
            var instance = target is Type ? null : target;
            for (var t = type; t != null; t = t.BaseType)
            {
                if (t.GetProperty(name, All | BindingFlags.DeclaredOnly) is { } p) return p.GetValue(instance);
                if (t.GetField(name, All | BindingFlags.DeclaredOnly) is { } f) return f.GetValue(instance);
            }

            throw new MissingMemberException(type.FullName, name);
        }

        static object? Call(object target, string name, params object?[] args)
        {
            var type = target as Type ?? target.GetType();
            var method = type.GetMethods(All).FirstOrDefault(m => m.Name == name && m.GetParameters().Length == args.Length)
                         ?? throw new MissingMethodException(type.FullName, name);

            return method.Invoke(target is Type ? null : target, args);
        }

        /// <summary>The public fields and properties of a row object; references are only told apart from null.</summary>
        static Dictionary<string, object?> Members(object row)
        {
            var map = new Dictionary<string, object?>();
            var members = row.GetType().GetMembers(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => m is FieldInfo || m is PropertyInfo { CanRead: true } p && p.GetIndexParameters().Length == 0)
                .OrderBy(m => m.MetadataToken);

            foreach (var m in members)
            {
                var (valueType, value) = m is FieldInfo f
                    ? (f.FieldType, f.GetValue(row))
                    : (((PropertyInfo)m).PropertyType, ((PropertyInfo)m).GetValue(row));

                if (valueType.Name == "TipCard") map[m.Name] = Card(value);
                else if (valueType.IsPrimitive || valueType.IsEnum || valueType == typeof(string)) map[m.Name] = Plain(value);
                else map[m.Name + "_null"] = value == null;
            }

            return map;
        }

        /// <summary>A TipCard as {text, image}; a missing one reads empty, or null where <paramref name="orNull" />.</summary>
        static Dictionary<string, object?>? Card(object? card, bool orNull = false)
        {
            if (card == null)
                return orNull ? null : new Dictionary<string, object?> { ["text"] = "", ["image"] = "" };

            return new Dictionary<string, object?> { ["text"] = Get(card, "Text"), ["image"] = Get(card, "Image") };
        }

        static List<object?> Names(IEnumerable values)
        {
            return values.Cast<object>().Select(v => (object?)v.ToString()).ToList();
        }

        /// <summary>A setting value as the site stores it: colours as #RRGGBBAA, enums and bindings as text.</summary>
        static object? Plain(object? value)
        {
            return value switch
            {
                null                                  => null,
                bool or int or float or double or string => value,
                Enum e                                => e.ToString(),
                Color c                               => "#" + ColorUtility.ToHtmlStringRGBA(c),
                _                                     => value.ToString()
            };
        }

        // ---- JSON ------------------------------------------------------------------------------------

        static void Write(string path, object value)
        {
            var sb = new StringBuilder();
            Json(sb, value, 0);
            File.WriteAllText(path, sb.Append('\n').ToString(), new UTF8Encoding(false));
        }

        static void Json(StringBuilder sb, object? value, int depth)
        {
            switch (value)
            {
                case null:
                    sb.Append("null");
                    break;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    break;
                case string s:
                    Quote(sb, s);
                    break;
                case float f:
                    sb.Append(f.ToString("R", CultureInfo.InvariantCulture));
                    break;
                case double d:
                    sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
                    break;
                case int or long:
                    sb.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                    break;
                case IDictionary map:
                {
                    sb.Append('{');
                    var first = true;
                    foreach (DictionaryEntry e in map)
                    {
                        sb.Append(first ? "\n" : ",\n").Append(' ', depth + 1);
                        Quote(sb, (string)e.Key);
                        sb.Append(": ");
                        Json(sb, e.Value, depth + 1);
                        first = false;
                    }

                    if (!first) sb.Append('\n').Append(' ', depth);
                    sb.Append('}');
                    break;
                }
                case IEnumerable list:
                {
                    sb.Append('[');
                    var first = true;
                    foreach (var item in list)
                    {
                        sb.Append(first ? "\n" : ",\n").Append(' ', depth + 1);
                        Json(sb, item, depth + 1);
                        first = false;
                    }

                    if (!first) sb.Append('\n').Append(' ', depth);
                    sb.Append(']');
                    break;
                }
                default:
                    Quote(sb, value.ToString());
                    break;
            }
        }

        static void Quote(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (var c in s)
                switch (c)
                {
                    case '"':  sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }

            sb.Append('"');
        }
    }
}
