import styles from './MenuBar.module.css';

export function MenuBar() {
  return (
    <header className={styles.menuBar}>
      <div className={styles.logo}>
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="var(--color-accent-primary)" />
          <text
            x="16"
            y="22"
            textAnchor="middle"
            fill="white"
            fontSize="18"
            fontWeight="bold"
            fontFamily="var(--font-family-ui)"
          >
            Q
          </text>
        </svg>
        <span className={styles.logoText}>Quar Animator</span>
      </div>

      <nav className={styles.menus}>
        <button className={styles.menuItem}>File</button>
        <button className={styles.menuItem}>Edit</button>
        <button className={styles.menuItem}>View</button>
        <button className={styles.menuItem}>Animation</button>
        <button className={styles.menuItem}>Rigging</button>
        <button className={styles.menuItem}>Export</button>
        <button className={styles.menuItem}>Help</button>
      </nav>

      <div className={styles.actions}>
        <span className={styles.projectName}>Untitled Project</span>
      </div>
    </header>
  );
}

export default MenuBar;
