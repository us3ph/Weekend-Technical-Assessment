import AppHeader from "@/components/AppHeader";
import PlanningWorkspace from "@/components/PlanningWorkspace";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.shell}>
      <AppHeader />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="page-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span aria-hidden="true" />
              Daily planning workspace
            </p>
            <h1 id="page-title" className={styles.title}>
              From orchard receipts to a <span>clear export decision.</span>
            </h1>
            <p className={styles.intro}>
              Align actual production, client priorities, and station capacity in one
              traceable plan built for the daily committee review.
            </p>

            <ul className={styles.assuranceList} aria-label="Workspace safeguards">
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 10 3 3 7-7" />
                </svg>
                Server-validated source
              </li>
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 10 3 3 7-7" />
                </svg>
                Deterministic allocation
              </li>
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 10 3 3 7-7" />
                </svg>
                Human approval retained
              </li>
            </ul>
          </div>

          <aside className={styles.workflowCard} aria-labelledby="workflow-title">
            <div className={styles.workflowHeading}>
              <div>
                <p>Today&apos;s workflow</p>
                <h2 id="workflow-title">One source. One plan. Full trace.</h2>
              </div>
              <span>3 steps</span>
            </div>
            <ol className={styles.workflowList}>
              <li>
                <span aria-hidden="true"><span>01</span></span>
                <div>
                  <strong>Load &amp; validate</strong>
                  <p>Confirm the authoritative workbook and source health.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true"><span>02</span></span>
                <div>
                  <strong>Compare &amp; prioritize</strong>
                  <p>See production gaps and commercial risk together.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true"><span>03</span></span>
                <div>
                  <strong>Review &amp; trace</strong>
                  <p>Inspect every export allocation and local residual.</p>
                </div>
              </li>
            </ol>
            <p className={styles.workflowNote}>
              Read-only recommendation · no automatic execution
            </p>
          </aside>
        </section>

        <PlanningWorkspace />
      </main>
      <footer className={styles.footer}>
        <div>
          <strong>Atlas Fresh</strong>
          <span>Daily export decision workspace</span>
        </div>
        <p>Production and Commercial remain responsible for approving execution.</p>
      </footer>
    </div>
  );
}
