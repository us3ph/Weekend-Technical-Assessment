import styles from "./AppHeader.module.css";

export default function AppHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="#main-content" aria-label="Atlas Fresh planner home">
        <span className={styles.mark} aria-hidden="true">
          <svg viewBox="0 0 32 32" role="img">
            <path d="M16.2 10.1c-2.5-2.3-6.9-1.6-8.6 1.7-2.6 5.1 1.8 12.5 8.4 13 6.6-.5 11-7.9 8.4-13-1.7-3.3-5.8-4-8.2-1.7Z" />
            <path d="M16.1 10c-.2-3.4 1.8-5.8 5.3-6.4.1 3.2-1.8 5.4-5.3 6.4Z" />
            <path d="M15.9 10.2c-1.1-2.6-3-4.2-5.6-4.7" />
          </svg>
        </span>
        <span className={styles.brandCopy}>
          <strong>Atlas Fresh</strong>
          <small>Decision intelligence</small>
        </span>
      </a>
      <div className={styles.headerMeta}>
        <span className={styles.status}>
          <span aria-hidden="true" />
          Operational workspace
        </span>
        <span className={styles.context}>Production + Commercial</span>
      </div>
    </header>
  );
}
