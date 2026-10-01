/** Accept return destinations within this app, including query strings. */
export function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  return value;
}
