import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window } from "herdr";
import { button, narrow, toggleSidebar } from "./ui.js";

export default class Chrome extends View {
  render() {
    const t = theme(), compact = narrow();
    if (props()?.footer) {
      return v_flex().size_full().bg(t.chrome).px(compact ? 2 : 8).gap(3).py(5)
        .border_t(1).border_color(t.border).text_size(11)
        .child(button("settings", compact ? "[*]" : "[ settings ]", "Settings and themes",
          () => run("app.settings", {section: "look"})))
        .child(button("machine", compact ? "[+]" : "[ add machine ]", "Add machine",
          () => run("mod.open", {name: "machine-add"})));
    }
    const mac = window()?.platform === "macos" && !window()?.fullscreen;
    return h_flex().size_full().min_w(0).items_center().gap(3).px(8).bg(t.chrome)
      .text_size(12).border_b(1).border_color(t.border)
      .when(mac && !compact, el => el.pl(80))
      .when(!compact, el => el.child(div().flex_1().text_color(t.accent).child("herdr24")))
      .when(!compact, el => el.child(button("search", "[/]", "Search spaces and agents",
        () => run("mod.open", {name: "picker"}))))
      .when(!(mac && compact), el => el.child(button("sidebar-toggle", compact ? ">>" : "<<",
        "Expand or collapse sidebar", toggleSidebar)));
  }
}
