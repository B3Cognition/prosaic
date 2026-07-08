export { planReconcile } from './planner';

/**
 * Reconciliation is computed by {@link planReconcile} during apply planning and
 * applied by the executor's removal pass. It removes only manifest-recorded
 * files that the current run no longer produces (FR-028, FR-051); this module
 * re-exports the planner entry point so the reconcile concern has a named home.
 */
