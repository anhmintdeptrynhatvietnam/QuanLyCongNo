# Review Progress Coordination

Review quality does not depend on a particular task API. Discover the live
task-management surface at runtime (`TaskCreate`/`TaskUpdate`/`TodoWrite` on
this runtime). Use it when available; otherwise update the active plan
directly. Plan files are the durable source of truth.

## When Tracking Helps

| Review scope | Track separately? | Reason |
|--------------|-------------------|--------|
| Single-file fix | No | Run scout, review, and verification directly |
| Multi-file feature | Yes | Preserve the scout → review → adversarial → fix → verify chain |
| Parallel reviewer scopes | Yes | Record ownership and join points |
| Critical fix cycle | Yes | Keep each re-review tied to its prerequisite fix |

Skip runtime tracking for fewer than three meaningful steps.

## Pipeline

Use this dependency order:

1. Scout edge cases.
2. Review the implementation after scouting completes.
3. Run adversarial review after the quality review completes (always-on, subject
   to the scope gate in `adversarial-review.md`).
4. Fix accepted Critical and Important findings after adjudication.
5. Verify the fixes with fresh evidence.

Record pending, active, blocked, and completed states through the live surface
when it supports them. If it does not, use checklist state in the active plan
and advance only after each prerequisite is complete.

## Parallel Reviews

- Split only independent file or subsystem scopes.
- Record one owner per scope before dispatch.
- Join all reviewer results before starting the shared adversarial and fix steps.
- Keep reviewer findings in reports or the plan, not only in session state.

## Re-Review Cycles

If fixes introduce new issues, append another review cycle after the fix and
verification work. Limit the loop to three cycles, then ask the user how to
proceed.

## Integration with Implementation Phases

Review coordination is separate from implementation phase tracking.

1. The implementation skill completes a phase, then starts the review pipeline.
2. The pipeline runs scout → review → adversarial → fix → verify.
3. The whole pipeline completes, then the phase counts as reviewed.
4. The implementation skill proceeds to the next phase.

The pipeline references the phase but does not block it directly — the
orchestrator manages the handoff.

## Sync-Back

Before claiming completion:

1. Reconcile finished review work with the active plan.
2. Update all affected phase checkboxes, including stale earlier phases.
3. Record unresolved findings and mappings.
4. Treat runtime state as disposable once the plan is current.
