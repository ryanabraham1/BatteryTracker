"use client";
import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

const TIPS_KEY = "work-tips-dismissed";
const tipsListeners = new Set<() => void>();
function tipsSubscribe(listener: () => void) {
  tipsListeners.add(listener);
  return () => void tipsListeners.delete(listener);
}
function tipsDismissed() {
  try {
    return localStorage.getItem(TIPS_KEY) === "1";
  } catch {
    return false;
  }
}
function dismissTips() {
  try {
    localStorage.setItem(TIPS_KEY, "1");
  } catch {
    /* Private mode: the card just comes back next visit. */
  }
  tipsListeners.forEach((l) => l());
}

/** A short, dismissible "start here" card for people new to the workspace. */
export function GettingStarted({ onHelp }: { onHelp: () => void }) {
  const hidden = useSyncExternalStore(tipsSubscribe, tipsDismissed, () => true);
  if (hidden) return null;
  return (
    <aside className="work-tips" aria-label="Getting started">
      <div>
        <b>New here? Three things to know</b>
        <ul>
          <li>
            An <b>issue</b> is one task. Type a title in the box above and press Enter to add one.
          </li>
          <li>
            Click the circle next to an issue to change its status, like <i>Todo</i> or <i>Done</i>.
          </li>
          <li>
            Group issues into a <b>project</b> to track a bigger goal.{" "}
            <button className="work-text-button" onClick={onHelp}>
              See the full guide
            </button>
          </li>
        </ul>
      </div>
      <button className="work-icon-button" aria-label="Dismiss tips" onClick={dismissTips}>
        <Icon name="close" size={16} />
      </button>
    </aside>
  );
}

const TERMS: [string, string][] = [
  ["Issue", "A single task or problem to fix, like “Replace the intake belt”."],
  ["Project", "A bigger piece of work made of many issues, with a start and target date."],
  ["Initiative", "A season-long goal that groups several projects together."],
  ["Milestone", "A checkpoint inside a project, like “Drive base done”."],
  ["Status", "Where an issue is: Backlog → Todo → In progress → In review → Done."],
  ["View", "A saved set of filters you can come back to with one click."],
];
const KEYS: [string, string][] = [
  ["C", "Create an issue"],
  ["/", "Jump to the search box"],
  ["⌘ / Ctrl + K", "Search everything and jump anywhere"],
  ["?", "Open this guide"],
  ["Esc", "Close any open window"],
];

export function HelpGuide() {
  return (
    <div className="work-help">
      <section>
        <h3>What things mean</h3>
        <dl>
          {TERMS.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Shortcuts</h3>
        <dl>
          {KEYS.map(([key, text]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Handy tricks</h3>
        <ul>
          <li>Click the status circle, priority, or avatar on any row to change it without opening the issue.</li>
          <li>Tick a few issues to change their status or archive them all at once.</li>
          <li>On a phone, tap the menu button in the top left to switch pages.</li>
        </ul>
      </section>
    </div>
  );
}
