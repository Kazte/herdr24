import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, theme, run, setAgentOrder, checking, shared, setShared } from "herdr";
import { button, label, narrow, status, toggleSidebar } from "./ui.js";

const rank = {blocked: 0, done: 1, working: 2, idle: 3};

// agents() only includes pane-backed agents. Discover live terminal descendants
// separately, keeping mapped machine addresses intact and visiting each identity once.
function collectRows(listed, all) {
  const rows = new Map(listed.map(agent => [agent.address, agent]));
  const children = new Map(), indexed = new Set();
  for (const terminal of all) {
    if (terminal.state !== "live" || !terminal.address || indexed.has(terminal.address)) continue;
    indexed.add(terminal.address);
    const siblings = children.get(terminal.parent) ?? [];
    siblings.push(terminal); children.set(terminal.parent, siblings);
  }
  const visited = new Set(), pending = [...rows.values()].reverse();
  while (pending.length) {
    const parent = pending.pop();
    if (visited.has(parent.address)) continue;
    visited.add(parent.address);
    for (const terminal of children.get(parent.address) ?? []) {
      if (!rows.has(terminal.address)) {
        rows.set(terminal.address, {
          address: terminal.address, space: parent.space, space_name: parent.space_name, tab: parent.tab,
          title: terminal.name || terminal.template || terminal.program?.name || terminal.address,
          program: terminal.program, pinned: Boolean(terminal.labels?.["herdr.pinned"]),
          status: terminal.status === "error" ? "blocked" : terminal.status === "done" ? "idle" : terminal.status,
          unkept: true,
        });
      }
      if (!visited.has(terminal.address)) pending.push(rows.get(terminal.address));
    }
  }
  return [...rows.values()];
}

export default class Agents extends View {
  render() {
    const t = theme(), compact = narrow(), grouped = shared("herdr24.agents-grouped") === true;
    const list = collectRows(agents(), terminals()).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || (grouped ? (a.space_name ?? "").localeCompare(b.space_name ?? "") : 0)
      || (rank[a.status] ?? 4) - (rank[b.status] ?? 4));
    if (!checking()) setAgentOrder(list.map(agent => agent.address));
    const rows = list.map((agent, index) => h_flex().id(`agent-${agent.address}`).px(6).py(6).gap(5)
      .items_center().bg(agent.focused ? t.selected : t.chrome).hover(s => s.bg(t.hover))
      .tooltip(`${agent.space_name ?? ""}: ${agent.title || agent.program?.name || agent.address} / ${agent.status}`)
      .accessibility_label(`Agent ${agent.title || agent.address}, ${agent.status}`)
      .on_click(() => run(agent.unkept ? "terminal.peek" : "agent.focus", {terminal: agent.address}))
      .when(compact, el => el.child(div().text_color(t[agent.status] ?? t.dim).child(`${agent.pinned ? "*" : ""}${index + 1}`)))
      .when(!compact, el => el.child(v_flex().flex_1().min_w(0).gap(3)
        .child(label(`${agent.unkept ? "-> " : ""}${agent.title || agent.program?.name || agent.address}`).text_color(t.foreground))
        .child(h_flex().gap(5).items_center().child(status(agent.status))
          .child(label(agent.space_name ?? "").text_color(t.dim).text_size(10))))
        .child(button(`pin-${agent.address}`, agent.pinned ? "[*]" : "[ ]", agent.pinned ? "Unpin agent" : "Pin agent",
          () => run("terminal.pin", {terminal: agent.address, pinned: !agent.pinned})))));
    return v_flex().size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(12)
      .child(h_flex().h(30).px(6).items_center().justify_between().text_color(t.dim)
        .when(!compact, el => el.child("[ agents ]"))
        .when(compact, el => el.child(button("agent-expand", ">>", "Expand sidebar", toggleSidebar)))
        .when(!compact, el => el.child(button("agent-sort", grouped ? "space" : "priority", "Toggle agent grouping",
          () => setShared("herdr24.agents-grouped", !grouped)))))
      .child(v_flex().flex_1().min_h(0).px(4).overflow_y_scrollbar().children(rows)
        .when(!list.length && !compact, el => el.child(div().p(8).text_color(t.dim).child("No agents running"))));
  }
}
