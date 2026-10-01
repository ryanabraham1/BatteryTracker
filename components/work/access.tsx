"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkAccess } from "@/app/work-actions";
import type { WorkAccess, WorkRole } from "@/lib/work-auth";
export function AccessPanel({
  accounts,
  currentEmail,
}: {
  accounts: WorkAccess[];
  currentEmail: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkRole>("member");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function save(email: string, role: WorkRole, disabled = false) {
    startTransition(async () => {
      setError("");
      const result = await setWorkAccess(email, role, disabled);
      if (!result.ok) setError(result.error || "Couldn't save access.");
      else {
        setEmail("");
        router.refresh();
      }
    });
  }
  return (
    <div className="work-access">
      <h2>People</h2>
      <form
        className="work-access-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(email, role);
        }}
      >
        <label>
          <span>Email</span>
          <input
            className="input"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span>Role</span>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkRole)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={pending}>
          Add access
        </button>
      </form>
      <p className="work-muted">
        Admins manage access and teams. Members edit work. Viewers can read.
        Added people sign in with their own Google account.
      </p>
      {error && (
        <p className="work-error" role="alert">
          {error}
        </p>
      )}
      <div className="work-access-list">
        {accounts.map((a) => (
          <div key={a.email}>
            <div>
              <b>{a.email}</b>
              <span className="work-muted">
                {a.disabled
                  ? "Disabled"
                  : a.user_id
                    ? "Joined"
                    : "Not signed in yet"}
              </span>
            </div>
            <select
              className="work-control"
              aria-label={`Role for ${a.email}`}
              value={a.role}
              disabled={pending || a.email === currentEmail}
              onChange={(e) =>
                save(a.email, e.target.value as WorkRole, a.disabled)
              }
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              className="work-text-button"
              disabled={pending || a.email === currentEmail}
              onClick={() => save(a.email, a.role, !a.disabled)}
            >
              {a.disabled ? "Enable" : "Disable"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
