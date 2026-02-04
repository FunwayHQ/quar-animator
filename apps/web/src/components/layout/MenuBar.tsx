import styles from './MenuBar.module.css';

export function MenuBar() {
  return (
    <header className={styles.menuBar}>
      <div className={styles.logo}>
        <img src="/logo.svg" alt="Quar Animator" className={styles.logoImage} />
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
