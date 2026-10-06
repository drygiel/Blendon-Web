// The slot pop-ups: the action tree, the icon grid, the rename field and the right-click menu. Each is
// placed by the editor; these only draw and report the pick.
import { useMemo, useState, type ReactNode } from 'react';
import { iconUrl } from '../../scene/unity/icons.ts';
import {
  actionLeaves,
  actionTree,
  EditorIcons,
  hasIcon,
  iconKey,
  iconTitle,
  isLeaf,
  type ActionBranch,
  type ActionLeaf,
} from './draft.ts';

function Header({ title, close, closeTip }: { title: string; close: () => void; closeTip: string }) {
  return (
    <div className="pe-phead">
      <span>{title}</span>
      <button className="pe-px" onClick={close} title={closeTip} aria-label={closeTip}>
        ×
      </button>
    </div>
  );
}

interface SearchProps {
  value: string;
  set: (v: string) => void;
  label: string;
  onEnter?: () => void;
}

function Search({ value, set, label, onEnter }: SearchProps) {
  return (
    <input
      className="pe-search"
      type="text"
      value={value}
      placeholder="Search..."
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      aria-label={label}
      spellCheck={false}
      autoComplete="off"
      autoFocus
    />
  );
}

const Icon = ({ name }: { name: string }) =>
  hasIcon(name) ? (
    <img className="pe-ricon" src={iconUrl(name)} alt="" width={16} height={16} draggable={false} />
  ) : (
    <span className="pe-ricon" />
  );

const matches = (text: string, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => text.toLowerCase().includes(w));

interface ActionPickerProps {
  current: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** PathDropdownWindow: Blendon's actions pinned first, then the main menu, with a search over both. */
export function ActionPicker({ current, onPick, onClose }: ActionPickerProps) {
  const tree = useMemo(() => actionTree(), []);
  const leaves = useMemo(() => actionLeaves(tree), [tree]);
  const [search, setSearch] = useState('');
  // The current action's branches start open, so the picker opens on what the slot runs.
  const [open, setOpen] = useState(() => {
    const parts = (current || 'Blendon/').split('/').slice(0, -1);
    return new Set(parts.map((_, i) => parts.slice(0, i + 1).join('/')).concat('Blendon'));
  });
  const found = search.trim() ? leaves.filter((l) => matches(l.path, search)) : null;

  const leaf = (l: ActionLeaf, depth: number, path = false) => (
    <button
      key={l.path}
      className={'pe-row' + (l.path === current ? ' on' : '')}
      style={{ paddingLeft: 4 + depth * 14 + 13 }}
      onClick={() => onPick(l.path)}
      title={l.path}
    >
      <Icon name={l.icon} />
      <span className="pe-rn">{l.name}</span>
      {path && <span className="pe-rp">{l.path.slice(0, -l.name.length - 1)}</span>}
    </button>
  );

  const branch = (b: ActionBranch, depth: number, prefix: string): ReactNode[] =>
    b.children.flatMap((c) => {
      if (isLeaf(c)) return [leaf(c, depth)];
      const key = prefix + c.name;
      const isOpen = open.has(key);
      const toggle = () =>
        setOpen((s) => {
          const n = new Set(s);
          if (isOpen) n.delete(key);
          else n.add(key);
          return n;
        });
      return [
        <button key={key} className="pe-row br" style={{ paddingLeft: 4 + depth * 14 }} onClick={toggle}>
          <span className="pe-arrow">{isOpen ? '▾' : '▸'}</span>
          <span className="pe-rn">{c.name}</span>
        </button>,
        ...(isOpen ? branch(c, depth + 1, key + '/') : []),
      ];
    });

  return (
    <>
      <Header
        title={found ? `Action  (${found.length})` : 'Action'}
        close={onClose}
        closeTip="Close without choosing an action"
      />
      <div className="pe-pbar">
        <Search
          value={search}
          set={setSearch}
          label="Search actions"
          onEnter={() => found?.[0] && onPick(found[0].path)}
        />
      </div>
      <div className="pe-plist">
        {found
          ? found.length
            ? found.map((l) => leaf(l, 0, true))
            : [
                <div key="none" className="pe-pnone">
                  Nothing matches
                </div>,
              ]
          : branch(tree, 0, '')}
      </div>
    </>
  );
}

interface IconPickerProps {
  current: string;
  onPick: (icon: string) => void;
  onClose: () => void;
}

/** IconPickerWindow: bare glyphs in a grid, the name only on hover. */
export function IconPicker({ current, onPick, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const icons = EditorIcons.filter((n) => matches(iconTitle(n), search));
  return (
    <>
      <Header title="Pick Icon" close={onClose} closeTip="Close without picking an icon" />
      <div className="pe-pbar">
        <Search value={search} set={setSearch} label="Search icons" />
      </div>
      <div className="pe-grid" onMouseLeave={() => setHovered(null)}>
        {icons.map((n) => (
          <button
            key={n}
            className={'pe-cell' + (iconKey(current) === n ? ' on' : '')}
            onClick={() => onPick(n)}
            onMouseEnter={() => setHovered(n)}
            aria-label={iconTitle(n)}
          >
            <img src={iconUrl(n)} alt="" width={20} height={20} draggable={false} />
          </button>
        ))}
        {!icons.length && <div className="pe-pnone">Nothing matches</div>}
      </div>
      <div className="pe-hover">{hovered ? iconTitle(hovered) : `${icons.length} icons`}</div>
    </>
  );
}

interface RenameProps {
  current: string;
  onDone: (name: string) => void;
  onClose: () => void;
}

/** SlotRenameWindow: blank or the natural name both mean "no rename". */
export function Rename({ current, onDone, onClose }: RenameProps) {
  const [text, setText] = useState(current);
  return (
    <div className="pe-rename">
      <input
        className="pe-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone(text.trim());
          if (e.key === 'Escape') onClose();
        }}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Slot name"
        spellCheck={false}
        autoComplete="off"
        autoFocus
      />
      <div className="pe-rbtns">
        <button className="nb" onClick={() => onDone('')} title="Put back what this item is normally called">
          Use Default
        </button>
        <button className="nb pri" onClick={() => onDone(text.trim())} title="Keep this name (Enter)">
          Rename
        </button>
      </div>
    </div>
  );
}

export type SlotMenuPick = 'action' | 'icon' | 'rename' | 'copy' | 'paste' | 'clear';

/** No label: a separator. */
export interface SlotMenuEntry {
  label?: string;
  enabled?: boolean;
  value?: SlotMenuPick;
}

/** The slot's right-click menu; an entry that doesn't apply greys out rather than disappearing. */
export function SlotMenu({ entries, onPick }: { entries: SlotMenuEntry[]; onPick: (v: SlotMenuPick) => void }) {
  return (
    <div className="pe-menu" role="menu">
      {entries.map((m, i) =>
        m.label ? (
          <button
            key={i}
            className={'mi' + (m.enabled === false ? ' dis' : '')}
            onClick={() => m.enabled !== false && m.value && onPick(m.value)}
            role="menuitem"
          >
            {m.label}
          </button>
        ) : (
          <div key={i} className="pe-sep" />
        ),
      )}
    </div>
  );
}
