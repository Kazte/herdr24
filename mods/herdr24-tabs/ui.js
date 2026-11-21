import { div } from "gpui-kit";
import { theme, run, layout, window, shared, setShared, openOverlay } from "herdr";

export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export const narrow = () => (findNode(layout(), "sidebar")?.size?.px ?? 250) < 160;
export const stop = (_event, cx) => cx.stop_propagation();
export const label = text => div().min_w(0).truncate().child(text);
export const tone = status => theme()[status] ?? theme().dim;
export const statusLabel = status => ({working: "working", blocked: "blocked", done: "done", idle: "idle"}[status] ?? "shell");

export function status(status) {
  const node = div().flex_none().text_size(11).text_color(tone(status));
  return status === "working"
    ? node.frames(["[|]", "[/]", "[-]", "[\\]"], 160).tooltip("Working")
    : node.child(`[${statusLabel(status)}]`);
}

export function button(id, text, description, action) {
  const t = theme();
  return div().id(id).flex_none().px(5).py(3).text_color(t.muted)
    .cursor_pointer().tooltip(description).accessibility_label(description)
    .hover(s => s.bg(t.hover).text_color(t.foreground))
    .on_mouse_down("left", stop)
    .on_click((event, cx) => { cx.stop_propagation(); action(event, cx); }).child(text);
}

export function menu(tab, target) {
  openOverlay({ mod: "menu", kind: "popup", width: 220, height: 300, props: { tab, target } });
}

export function toggleSidebar() {
  const collapsed = narrow();
  if (!collapsed) setShared("herdr24.sidebar-width", findNode(layout(), "sidebar")?.size?.px ?? 250);
  run("layout.resize", { id: "sidebar", px: collapsed
    ? shared("herdr24.sidebar-width") ?? 250 : window()?.platform === "macos" ? 76 : 44 });
}
