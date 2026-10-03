// Styles for the panel. It lives in a shadow root, so these rules cannot
// leak into Google Maps and Google's rules cannot reach in.
export const PANEL_CSS = `
:host { all: initial; }
.panel {
  position: fixed; top: 76px; right: 16px; z-index: 2147483000;
  width: 300px; box-sizing: border-box;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1b2419; background: #ffffff;
  border: 1px solid #dfe4d7; border-radius: 14px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  overflow: hidden;
}
.panel.collapsed { width: auto; }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 12px; background: #eef1e8; }
.brand { font-weight: 700; flex: 1; white-space: nowrap; }
.icon-btn { border: 0; background: transparent; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 8px; color: #4b5946; }
.icon-btn:hover { background: #dfe4d7; }
.body { padding: 10px 12px 12px; display: grid; gap: 8px; }
.title { font-weight: 700; font-size: 14px; }
.title a { color: inherit; text-decoration: none; }
.title a:hover { text-decoration: underline; }
.muted { color: #8a9584; font-size: 12px; }
.error { color: #c53030; }
.rows { display: grid; gap: 2px; }
.row { display: flex; align-items: center; gap: 6px; font-size: 15px; }
.row .score { font-size: 12px; font-weight: 700; color: #4b5946; }
.row .none { font-size: 12px; color: #8a9584; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
button.btn {
  font: inherit; font-weight: 600; font-size: 12px; cursor: pointer;
  border: 1px solid #dfe4d7; background: #fff; color: #1b2419;
  border-radius: 10px; padding: 6px 10px;
}
button.btn:hover { background: #f6f7f2; }
button.btn:disabled { opacity: 0.5; cursor: default; }
button.primary { background: #2f855a; border-color: #2f855a; color: #fff; }
button.primary:hover { background: #276749; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
button.chip { font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 999px; padding: 4px 10px; border: 1px solid #dfe4d7; background: #fff; color: #4b5946; }
button.chip[aria-pressed="true"] { background: #1b2419; border-color: #1b2419; color: #fff; }
.status { font-size: 12px; padding: 6px 8px; border-radius: 8px; background: #e2f3e8; color: #22543d; }
.status.warn { background: #fdf3e1; color: #7b4a0e; }
.nearby { display: grid; gap: 4px; }
.nearby button { text-align: left; }
`;
