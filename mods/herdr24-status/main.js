import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, keys } from "herdr";
import { button, label } from "./ui.js";

export default class Status extends View {
  render() {
    const t = theme(), current = spaces().find(space => space.active), list = agents();
    const blocked = list.filter(agent => agent.status === "blocked").length;
    const shortcut = keys().find(key => key.section === "global" && key.action === "app.palette")?.keys;
    return h_flex().size_full().min_w(0).px(8).gap(12).items_center().text_size(10)
      .bg(t.chrome).border_t(1).border_color(t.border).text_color(t.muted)
      .child(label(`@ ${current?.machine ?? "local"}`))
      .when(Boolean(current?.branch), el => el.child(label(`git:${current.branch}`).max_w(180)))
      .child(div().child(`${list.length} agents`))
      .when(blocked > 0, el => el.child(div().text_color(t.blocked).child(`[${blocked} blocked]`)))
      .child(div().flex_1())
      .child(button("palette", shortcut ? `${shortcut} / commands` : "[ commands ]", "Command palette", () => run("app.palette")));
  }
}
