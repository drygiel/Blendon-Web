import styles from './SpecStrip.module.scss';

const SPECS = [
  ['EDITOR-ONLY', 'Adds nothing to player builds. No runtime components, Editor assemblies only.'],
  ['PRIVATE', 'No network requests, no analytics, no extra packages installed.'],
  ['OPTIONAL', "Every feature switches off on its own. Each gizmo falls back to Unity's."],
  ['OPEN', 'Full C# source included, plus an illustrated PDF manual.'],
] as const;

export function SpecStrip() {
  return (
    <section className={styles.strip} aria-label="At a glance">
      <div className={styles.grid}>
        {SPECS.map(([label, text]) => (
          <div key={label} className={styles.cell}>
            <span className={styles.label}>{label}</span>
            <span className={styles.text}>{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
