import { View, div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces, machines, theme, run } from "herdr";
import { button, label, menu, narrow } from "./ui.js";

export default class Spaces extends View {
  init() { this.pressed = null; this.scroll = ScrollHandle.new(); }

  render() {
    const t = theme(), compact = narrow(), list = spaces();
    let active = -1;
    const hosts = [...new Set([...machines().map(machine => machine.name), ...list.map(space => space.machine)])];
    const rows = [];
    for (const host of hosts) {
      const state = machines().find(machine => machine.name === host)?.layout ?? "ready";
      if (!compact) rows.push(h_flex().px(6).py(5).text_size(10).text_color(t.dim).gap(4)
        .child(label(`@ ${host ?? "local"}${state === "ready" ? "" : ` / ${state}`}`)));
      for (const space of list.filter(space => space.machine === host)) {
        const i = list.indexOf(space);
        if (space.active) active = rows.length;
        rows.push(h_flex().id(`space-${space.id}`).h(30).px(6).gap(6).items_center()
          .bg(space.active ? t.selected : t.chrome).border_l(1).border_color(space.active ? t.accent : t.chrome)
          .text_color(space.active ? t.foreground : t.muted).tooltip(space.name).accessibility_label(`Space ${space.name}`)
          .hover(s => s.bg(t.hover))
          .on_mouse_down("left", () => { this.pressed = space.id; })
          .on_mouse_up("left", (_event, cx) => {
            const source = list.find(item => item.id === this.pressed); this.pressed = null;
            if (source?.id === space.id) run("space.select", {id: space.id});
            else if (source && source.machine === space.machine) run("space.move", {id: source.id, index: i + 1});
            cx.stop_propagation();
          })
          .on_mouse_down("right", () => menu("space", {id: space.id}))
          .child(div().flex_none().text_color(space.active ? t.accent : t.dim).child(compact ? `${i + 1}` : `${space.active ? ">" : "·"} ${i + 1}`))
          .when(!compact, el => el.child(label(space.name).flex_1())
            .when(Boolean(space.branch), row => row.child(label(space.branch).max_w(75).text_size(10).text_color(t.dim)))));
      }
      if (!compact && state === "ready") rows.push(button(`new-${host ?? "local"}`, "[ + space ]",
        `New space on ${host ?? "this computer"}`, () => run("space.new", {machine: host ?? ""})));
    }
    if (active !== this.active && active >= 0) this.scroll.scroll_to_item(active);
    this.active = active;
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(12)
      .on_mouse_up("left", () => { this.pressed = null; })
      .child(h_flex().h(30).px(6).justify_between().items_center().text_color(t.dim)
        .when(!compact, el => el.child("[ spaces ]"))
        .child(button("space-new", "+", "New space", () => run("space.new"))))
      .child(v_flex().flex_1().min_h(0).px(4).overflow_y_scrollbar().track_scroll(this.scroll)
        .on_size_change(() => { if (active >= 0) this.scroll.scroll_to_item(active); }).children(rows));
  }
}
