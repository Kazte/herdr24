import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, theme, run } from "herdr";
import { button, label, status } from "./ui.js";

export default class PaneHeader extends View {
  render() {
    const pane = panes().find(item => item.pane === props()?.pane);
    if (!pane) return div();
    const t = theme(), target = {pane: pane.pane};
    return h_flex().id(`header-${pane.pane}`).size_full().min_w(0).px(7).gap(5).items_center()
      .bg(t.background).border_b(1).border_color(t.border).text_size(11)
      .on_click(() => run("pane.focus", target))
      .child(div().text_color(pane.focused ? t.accent : t.dim).child(pane.focused ? ">" : "·"))
      .child(label(pane.program?.name || pane.title || "Terminal").max_w(120).text_color(t.foreground))
      .child(label(pane.cwd ?? pane.mod ?? "").flex_1().text_color(t.dim))
      .when(Boolean(pane.status), el => el.child(status(pane.status)))
      .child(button("split-right", "|+", "Split right", () => run("pane.split", {...target, direction: "right"})))
      .child(button("split-down", "_+", "Split down", () => run("pane.split", {...target, direction: "down"})))
      .child(button("zoom", pane.zoomed ? "[-]" : "[+]", "Zoom or restore pane", () => run("pane.zoom", target)))
      .child(button("close-pane", "x", "Close pane", () => run("pane.close", target)));
  }
}
