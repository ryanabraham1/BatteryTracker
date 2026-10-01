<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Keep issue lists consistent everywhere

Issues are rendered in several places: the main issue list and board (`IssueList`/`IssueBoard` in `components/work/collections.tsx`), a project's Issues tab (`project-detail.tsx`), and the sub-issue / milestone / initiative issue lists in `detail.tsx`. When asked to change how issues behave or look (context menu, hover actions, labels, columns, etc.), apply it to every one of these surfaces, not just the one mentioned. The issue right-click menu lives in `components/work/issue-menu.tsx` (`useIssueMenu`); reuse it rather than building new menus.
