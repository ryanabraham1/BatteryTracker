# Work feature coverage

Research date: September 30, 2026. The accompanying `linear-docs-inventory.json` records 143 unique official Linear documentation URLs and their headings. Research does not imply complete implementation. Work has a broad core workspace; full Linear feature parity remains incomplete.

## Implemented core

| Area         | Current app                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issues       | Create/edit, statuses, priority, estimates, assignee, teams, labels, deadlines, list/board, drag status, bulk status/archive, sub-issues, relationships, subscriptions, favorites, comments, activity, Markdown, links |
| Organization | Projects, initiatives, cycles, milestones, project leads/health/dates, initiative assignment, parent team/initiative properties, basic project timeline and progress                                                   |
| Finding work | Search, filters, grouping, sorting, saved views, personal issues, triage                                                                                                                                               |
| Team content | Documents, updates, basic insights, customer request and release records                                                                                                                                               |
| Reuse        | Templates, weekly/monthly recurring issues, JSON issue import, workspace JSON export                                                                                                                                   |
| Retention    | Archive, soft-delete, restore, revision checks to prevent overwriting concurrent edits                                                                                                                                 |
| Identity     | Individual Google sign-in flow, admin/member/viewer roles, email allowlist, disable access, verified actor attribution, personal read/snooze receipts                                                                  |
| UI           | Existing paper/purple theme, five main sidebar destinations, contextual tabs, command menu, mobile navigation, dialogs, restrained motion with reduced-motion support                                                  |

## Important differences and unfinished parity

- Google is configured and local OAuth completion is verified with the school admin account. Production deployment and sign-in still need verification. Setup details are in `work-google-sign-in.md`.
- Views and insights are basic. Advanced Boolean filters, custom reporting/dashboard construction, forecasts, and full Linear chart behavior are not implemented.
- Cycles are editable planning records. Automatic scheduling, rollover, capacity modeling, and complete cycle reports remain unfinished.
- Recurrence runs when Work loads, rather than on a background scheduler.
- Markdown documents/comments do not include Linear's full rich editor, attachments, threaded comments, comment editing, or document version restoration.
- Parent initiative/team fields exist; full nested navigation, descendant rollups, private teams, and granular per-team permissions remain unfinished. Current members share one workspace.
- Customers and releases are internal records; complete customer request workflows, SLAs, release tracking, and automation are unfinished.
- Templates provide reusable issue/project defaults, rather than complete form builders and all Linear template behaviors.
- Notifications are in-app activity/read/snooze. Email, push notifications, and full notification routing/preferences are unfinished. Recent activity is limited to the latest 2,000 events.
- Full issue history migration, rich import formats, attachments export, and complete workspace administration are unfinished.
- AI, external integrations, and public API parity are excluded as requested. Native desktop/mobile clients and enterprise provisioning are not part of this web app implementation.

## Validation

Production build, TypeScript, ESLint, input/filter unit tests, and rollback-only database tests passed during implementation. Database tests cover atomic changes, optimistic concurrency, recurring issue idempotency, public privilege restrictions, Google identity binding, initial admins, role enforcement, and self-demotion protection. Desktop/mobile layout and modal navigation were checked with an isolated development fixture; that temporary preview route was removed. The live unauthenticated route redirects to sign-in, and attempting sign-in while Google is disabled displays a useful setup error. After fixing the account-binding SQL privileges, the identity tests also run using the app service role. Local school-account OAuth completion and admin settings are verified; both school and Gmail accounts show as joined. Production sign-in and sign-out remain unverified.

Primary research: [Linear concepts](https://linear.app/docs/conceptual-model), [Linear documentation](https://linear.app/docs).
