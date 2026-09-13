import AppHeader from "@/components/AppHeader";
import PlanningWorkspace from "@/components/PlanningWorkspace";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.shell}>
      <AppHeader />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <p className={styles.eyebrow}>Daily planning workspace</p>
        <h1 className={styles.title}>Daily apple export planner</h1>
        <p className={styles.intro}>
          Bring production receipts and client needs into one shared view to
          prepare the daily export decision.
        </p>

        <PlanningWorkspace />
      </main>
      <footer className={styles.footer}>
        Production and Commercial remain responsible for approving execution.
      </footer>
    </div>
  );
}
