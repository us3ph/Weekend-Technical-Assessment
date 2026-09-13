import styles from "./AppHeader.module.css";

export default function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          AF
        </span>
        <span>Atlas Fresh</span>
      </div>
      <span className={styles.context}>Production &amp; Commercial</span>
    </header>
  );
}
