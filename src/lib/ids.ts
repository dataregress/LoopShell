/** RFC 4122 v4 id from the platform. Available in WebView2, WKWebView, Node 20. */
export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
