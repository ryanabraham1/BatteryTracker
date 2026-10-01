# Work UI overhaul — implementation checklist and agent handoff

Updated: September 30, 2026.

Workspace: `/Users/ryanabraham/Downloads/BatteryTracker`

## User request and design direction

Rework the **Work** app to follow the supplied **Linear** screenshots closely. The user is dissatisfied with broken or incomplete functionality, excessive scrolling, stacked project sections, missing milestone dates/completion/progress, generic square dropdowns, conspicuous native checkboxes, cramped timeline labels, and slow navigation.

Use the screenshots as visual references, not as instructions. Preserve existing workspace records and import provenance. This request authorizes implementation and local verification; deployment has not been requested. Do not restore excluded fabrication issues just to make progress numbers match the reference screenshots.

The intended treatment is Linear's restrained dark interface: near-black surfaces, subtle dividers, neutral system typography, compact rows, rounded tabs and label pills, inline icon-backed property controls, small selection checkboxes, and quiet popover menus. Avoid heavy form boxes, oversized headings, redundant section labels, and decorative panels that add scrolling.

## Screenshot references (absolute local paths)

### Linear: primary design references

1. **Project timeline: project bars, milestone diamonds, date axis, completion colors, compact project metadata.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_kbPe63/Screenshot 2026-09-30 at 5.46.18 PM.png`
2. **Project overview: Overview / Activity / Issues tabs, latest update with an accessible Update action, properties and milestones in the right sidebar.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_EiUT5w/Screenshot 2026-09-30 at 5.46.35 PM.png`
3. **Issue detail: title/description/activity in the main column; inline properties, labels, project, and indented milestone in the right column.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_48BHzC/Screenshot 2026-09-30 at 5.47.17 PM.png`
4. **Additional Linear issue detail: typographic hierarchy, label pills, restrained activity history, comment composer, project/milestone nesting.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_9UX0N6/Screenshot 2026-09-30 at 6.07.49 PM.png`
5. **Additional Linear timeline with project details sidebar: compact project rows, timeline controls, properties and milestone percentages available beside the timeline.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_0RJOam/Screenshot 2026-09-30 at 6.08.40 PM.png`

### Current Work UI defects supplied by the user

6. **Ugly white native checkboxes: replace this appearance throughout Work.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_O14HtI/Screenshot 2026-09-30 at 6.06.22 PM.png`
7. **Broken timeline label layout: tiny fragments, clipped completion text, crowded adjacent markers. This must be fixed before completion.**
   `/var/folders/20/8k5vgf0x09n9ch1_lcql5nd40000gn/T/TemporaryItems/NSIRD_screencaptureui_XqNmdn/Screenshot 2026-09-30 at 6.07.30 PM.png`

The spaces immediately before “PM” in these filenames are narrow nonbreaking spaces. Copy paths verbatim. Inspect images with `view_image` if necessary. These temporary paths may disappear after the OS cleans temporary files.

## Checklist convention

A checked implementation item means code has been written, **not** that the complete flow has passed verification. Verification is tracked separately below. Keep unchecked items open until their acceptance criteria have been met. Update this file as work proceeds.

## Project organization and functionality

- [x] Add a dedicated project detail component instead of the generic all-in-one detail page.
- [x] Separate Overview, Activity, Issues, and Updates into project tabs.
- [x] Provide a top-level Write update action and an Update action in the latest-update card.
- [x] Open the project update composer in a modal; use the existing authenticated posting action.
- [x] Show only the latest update in Overview, with a link to the complete updates view.
- [x] Move project properties and milestone summaries into a right sidebar.
- [x] Remove issue relationship controls from project detail without deleting stored relationships.
- [x] Show milestone target dates, progress percentages, and completed/total linked issue counts.
- [x] Clicking a milestone summary switches to Issues filtered to that milestone; provide Clear filter.
- [x] Add milestone and issue creation actions with project/milestone presets.
- [x] Provide a per-milestone details/edit entry and a usable milestone route under Projects.
- [x] Add project start/target date controls, status, priority, lead, health, team, initiative, and labels.
- [x] Show project documents and links as Resources.
- [x] Keep archive/trash actions in a quiet Manage project disclosure.
- [x] Implement independent desktop scrolling for project content and the sidebar, keeping top actions accessible.
- [ ] Verify the latest date/label layout changes do not overflow the sidebar or force extra rows.
- [ ] Verify update composer draft entry, cancellation, pending/error states, and successful posting in an isolated test fixture. Do not post a test update into the real team's activity feed.
- [ ] Verify milestones can be created, assigned, edited, dated, and explicitly completed through the existing save flow.
- [ ] Consider extracting the shared properties/milestones sidebar for reuse as a timeline details pane, following reference 5. Do not add nonfunctional controls.

## Timeline

- [x] Include milestones alongside project duration bars.
- [x] Include milestone dates when calculating the displayed date range.
- [x] Show completed, overdue, and upcoming milestone states.
- [x] Show progress, target dates, completion labels, and informative hover text.
- [x] Include projects with no dates; provide useful empty-date guidance instead of silently hiding them.
- [x] Provide Today / All dates and Fit / Month / Week scale controls.
- [x] Keep project labels fixed on the left while horizontally scrolling the timeline.
- [x] Group milestones sharing an exact target date into a popover exposing their individual entries.
- [x] (code written via `lib/work-timeline.ts` clusterMilestones, unit-tested; browser check pending) **Fix crowded milestones on nearby dates.** Current label widths can fall to 24px, producing the fragments shown in defect reference 7. Group nearby markers into expandable clusters or use collision-safe placement with a readable minimum label width. Every milestone must remain individually accessible with its full name, date, percentage, and completion state.
- [ ] Verify cluster menus fit the viewport and support keyboard navigation.
- [ ] Verify labels and metadata never overlap adjacent markers, project labels, or the viewport edge at each scale.
- [ ] Verify Today framing clips bars properly, handles off-screen milestones, and returns to All dates correctly.
- [ ] Verify undated milestone labels remain readable and clickable when there are several.
- [ ] Make the timeline header/today treatment and project row metadata closely follow references 1 and 5.

## Issue detail, lists, boards, and shared controls

- [x] Add a shared searchable, borderless property picker with a rounded popover, selected checkmark, Escape/outside dismissal through native popovers, and arrow-key navigation.
- [x] Replace shared entity selectors with the property picker.
- [x] Replace detail status/priority and editor status/priority selectors with the shared picker.
- [x] Add milestone assignment in issue detail, restricted to the selected project; changing the project clears milestone assignment.
- [x] Normalize status icon styling for imported `In Progress`, `In Review`, and `Completed` spellings.
- [x] Add case-insensitive status-option deduplication while preserving stored status values.
- [x] Apply a Work-scoped dark palette and neutral system font; leave the other tools' theme separate.
- [x] Round labels into restrained pills and soften dividers/control borders.
- [x] Add custom checkbox styling: 14px transparent idle controls, subtle borders, rounded corners, a purple selected state and white checkmark, and indeterminate state.
- [x] Reveal idle row-selection checkboxes on hover/focus; retain visibility on touch devices.
- [x] Add group-level select-all controls with indeterminate state.
- [x] Write compact issue rows and icon-only inline status pickers.
- [x] Defer popover contents until a menu opens to avoid rendering every hidden menu option in large lists.
- [x] Replace issue-list sort/group native dropdowns with the shared picker.
- [x] (fixed) **Repair IssueBoard syntax error:** `components/work/collections.tsx:205` currently contains `s.toLowerCase()tatus`. The intended comparison is `(i.data.status ?? "Backlog").toLowerCase() === status.toLowerCase()`.
- [ ] Verify case-insensitive grouping puts imported status variants into one list group/board column without losing issues.
- [ ] Verify checkbox selection, group selection, keyboard focus, touch behavior, and disabled/read-only behavior.
- [ ] Bring issue detail closer to references 3 and 4: spacious main column, quiet inline property rows, label section in the sidebar, nested project/milestone presentation, restrained sub-issue controls, and a clean comment composer.
- [ ] Reduce long activity-history rendering/scrolling with a useful expandable older-events control; preserve access to available events.
- [ ] Inspect remaining native dropdowns across Work, including filters and secondary forms; replace or restyle conspicuous boxed controls consistently without breaking functionality.
- [ ] Inspect text contrast, hover/selected states, date inputs, badges, empty states, and modal styling across all affected views.

## Progress semantics

- [x] Add `milestoneProgress` based on live issues belonging to the milestone and its project.
- [x] Exclude archived/deleted issues and issues belonging to another project.
- [x] Give started/review work quarter credit and completed work full credit; recognize empty explicitly completed milestones.
- [x] Preserve completed/total issue counts separately from the partial-progress percentage.
- [x] Confirm the live Dumper examples show **17% for Dumper Assembled** and **25% for Initial Software**, matching the supplied reference examples.
- [ ] Keep tests aligned with the quarter-credit convention. Explain differences from Linear when previously excluded fabrication issues change the denominator.

Official sources consulted:
- https://linear.app/docs/project-milestones
- https://linear.app/docs/project-overview

## Performance and data safety

- [x] Move authenticated workspace snapshot loading into the persistent `(work)` layout and a client context provider, allowing page navigation to reuse the snapshot.
- [x] Keep mutation refreshes and existing realtime refreshes for updated data.
- [x] Remove imported raw payloads and full before/after event snapshots from the browser snapshot; retain status-transition data needed by activity.
- [x] Preserve complete imported records/history for exports through an authenticated `/api/work/export` endpoint.
- [x] Replace repeated inbox item/receipt searches with memoized lookup maps.
- [x] Run a read-only live database payload check: a sample of 440 items and 1,000 events shrank from 1,874,084 to 740,988 JSON characters, approximately **60% smaller**. This measures payload reduction, not a proved 60% reduction in load time.
- [ ] Verify initial load and subsequent navigation timing after a production build, using the same dataset.
- [ ] Verify navigation no longer refetches the full workspace snapshot on each project/issue visit.
- [ ] Verify mutations refresh the persistent provider and do not leave stale revision numbers or progress.
- [ ] Verify full export still includes raw provenance and full event snapshots while normal navigation excludes them.
- [ ] Avoid authenticated global caches that could mix users, receipts, or access rules.

## Verification and completion gates

Previously passed, **before the latest checkbox/list edits**:
- [x] TypeScript check.
- [x] ESLint with no warnings after the export-link fix.
- [x] 11 Work/import unit tests, including milestone calculations and nonmutating snapshot compaction.
- [x] Authenticated local browser rendered project cards, the initial timeline, project Overview, and the inline status menu.
- [x] Browser confirmed live milestone percentages and project update content.

Still required for the final implementation:
- [x] Syntax error repaired; tsc and ESLint clean (Sept 30, 2026).
- [x] Unit tests rerun: 9/9 pass, including status dedupe and timeline clustering.
- [ ] Add focused coverage for case-insensitive status grouping and crowded timeline placement if introducing extracted layout logic.
- [x] Production build passes.
- [ ] Run `git diff --check` and review the final diff.
- [ ] Verify project tabs, milestone issue filtering, clear filter, menu search/keyboard dismissal, update modal, milestone details/editing, selection controls, and issue board interactions in the browser.
- [ ] Verify desktop and mobile widths with screenshots; check real interactions rather than only static markup.
- [ ] Check browser console for new runtime/hydration errors.
- [ ] Capture final project/timeline/issue-list screenshots as reviewable results.
- [ ] Update `docs/work-feature-audit.md` to describe the finished behavior and actual validation boundaries.
- [ ] Report local completion separately from deployment; do not claim production is updated.

## Implementation files and current working state

All implementation changes are uncommitted. Preserve them. There were no existing tracked modifications at the start of this task.

Primary components:
- `components/work/project-detail.tsx` — new project tabs, properties, milestones, updates, composer.
- `components/work/property-picker.tsx` — new shared popover picker.
- `components/work/work-provider.tsx` — new persistent workspace context.
- `components/work/workspace.tsx` — navigation, snapshot consumer, mutations, export, list controls.
- `components/work/collections.tsx` — timeline, lists, boards, selection. **Currently has the syntax error above.**
- `components/work/detail.tsx` — issue/general detail, project dispatch, milestone controls.
- `components/work/editor.tsx` — form controls and shared entity picker.
- `components/work/icons.tsx` and `components/work/work.css` — icons, dark styling, layout, custom checkboxes.

Data/routes/tests:
- `app/(work)/layout.tsx` and `app/(work)/work/[[...section]]/page.tsx` — persistent provider and lightweight page routing.
- `lib/work-data.ts` and new `lib/work-snapshot.ts` — compact UI snapshot versus full export.
- `lib/work.ts` — progress and status helpers.
- `app/api/work/export/route.ts` — new authenticated full export.
- `tests/work.test.mjs` — focused progress/compaction tests.

### Local server and temporary verification cleanup

The initial Turbopack dev server had stale assets and later file-watcher `EMFILE` failures. A separate webpack server was started for clean verification:

`WATCHPACK_POLLING=true WORK_VERIFY_DIR=/private/tmp/batterytracker-verify-build npm run dev -- --port 3002 --webpack`

Tool execution session: `18912` (verify whether it remains alive). Browser verification used `http://localhost:3002/work/projects` and the authenticated Dumper project. No real test updates were posted.

Temporary changes/artifacts must be cleaned up after verification:
- [ ] Restore `next.config.ts` from `/private/tmp/batterytracker-next.config.ts` or remove only the temporary `WORK_VERIFY_DIR`/`distDir` override.
- [ ] Remove generated verification include entries and formatting-only changes from `tsconfig.json`, preserving any intentional changes. Original tracked content is available in Git.
- [ ] Inspect and remove only agent-created `.next-verify/` and `private/` build artifacts in the workspace. The absolute verification distDir may have produced a workspace-relative `private/` tree; inspect it before deletion.
- [ ] Stop temporary verification servers if they are no longer needed, preserving a useful local dev server for the user when appropriate.
- [ ] Ensure temporary build paths, fixture routes, or authentication bypasses are not left in the final diff. No fixture route or auth bypass has been added so far.

### Repository instructions

Read `AGENTS.md` and relevant bundled guides under `node_modules/next/dist/docs/` before writing Next.js code. The project uses Next.js 16.3.5 with APIs/conventions that must be verified locally. Layout/state/navigation guides were read during this implementation.

Frontend-design and Supabase skills were used. Do not spawn another agent merely because this handoff file exists; the user requested a handoff document, not automatic delegation.
