"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { WorkSnapshot } from "@/lib/work";
import type { WorkUser, WorkAccess } from "@/lib/work-auth";
type WorkContext = { snapshot: WorkSnapshot; user: WorkUser; access: WorkAccess[] };
const Context = createContext<WorkContext | null>(null);
export function WorkProvider({ children, ...value }: WorkContext & { children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWork() {
  const value = useContext(Context);
  if (!value) throw new Error("Work requires its authenticated workspace provider.");
  return value;
}
