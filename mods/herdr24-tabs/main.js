import { View, div } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, theme, run, openOverlay, layout, window, settings, shared, checking } from "herdr";
import { button, findNode, label, menu, status } from "./ui.js";

export default class Tabs extends View {
  init() {
    this.scroll = ScrollHandle.new(); this.pressed = null; this.restore = null;
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.gesture = {distance: 0, at: 0, last: 0};
  }

  syncPanels(space, panel, stack, enabled) {
    if (checking() || !space || !panel) return;
    const shown = panel.hidden ? null : stack?.active ?? null;
    if (space.id !== this.currentSpace) {
      const first = this.currentSpace === undefined;
      this.currentSpace = space.id; this.restore = null;
      if (!(first && !Object.hasOwn(this.panels, space.id))) {
        const wanted = enabled.includes(this.panels[space.id]) ? this.panels[space.id] : null;
        if (shown !== wanted) {
          this.restore = {wanted, until: Date.now() + 1000};
          if (wanted) { run("layout.select", {stack: "panel-body", child: wanted}); run("layout.show", {id: "panel"}); }
          else run("layout.hide", {id: "panel"});
          return;
        }
      }
    }
    if (this.restore && this.restore.wanted !== shown && Date.now() < this.restore.until) return;
    this.restore = null;
    if (this.panels[space.id] !== shown) {
      this.panels[space.id] = shown;
      localStorage.setItem("panels", JSON.stringify(this.panels));
    }
  }

  wheel(event) {
    if (event.delta_lines?.y) { run(event.delta_lines.y > 0 ? "tab.prev" : "tab.next"); return; }
    const delta = event.delta?.y ?? 0, now = Date.now(), g = this.gesture;
    if (now - g.at > 250 || delta * g.distance < 0) g.distance = 0;
    g.at = now; g.distance += delta;
    if (Math.abs(g.distance) >= 40 && now - g.last >= 120) {
      run(g.distance > 0 ? "tab.prev" : "tab.next"); g.distance = 0; g.last = now;
    }
  }

  render() {
    const t = theme(), current = spaces().find(space => space.active), tabs = current?.tabs ?? [];
    const root = layout(), panel = findNode(root, "panel"), stack = findNode(root, "panel-body"), w = window();
    const configured = shared("workspace.panels");
    const enabled = Array.isArray(configured) ? configured.filter(id => ["files", "changes"].includes(id)) : ["files", "changes"];
    this.syncPanels(current, panel, stack, enabled);
    const selected = tabs.findIndex(tab => tab.active);
    if (tabs[selected]?.id !== this.selected && selected >= 0) this.scroll.scroll_to_item(selected);
    this.selected = tabs[selected]?.id;
    const sidebar = findNode(root, "sidebar");
    const occupied = sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0;
    const left = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen
      ? Math.max(8, ((root?.traffic_lights?.[0] ?? 12) + 68) / (settings().zoom ?? 1) - occupied) : 8;
    const rows = tabs.map((tab, index) => {
      const lead = panes().find(pane => pane.tab === tab.id);
      const name = tab.named ? tab.name : lead?.program?.name ?? tab.name ?? "Terminal";
      return h_flex().id(`tab-${tab.id}`).h(28).px(7).gap(6).items_center().flex_none()
        .border(1).border_color(tab.active ? t.accent : t.border).bg(tab.active ? t.selected : t.chrome)
        .text_color(tab.active ? t.foreground : t.muted).hover(s => s.bg(t.hover))
        .accessibility_label(`Tab ${name}`).tooltip(name)
        .on_mouse_down("left", (event, cx) => {
          cx.stop_propagation(); this.pressed = tab.id;
          if (event.click_count === 2) run("tab.rename", {id: tab.id});
        })
        .on_mouse_up("left", (_event, cx) => {
          cx.stop_propagation(); const source = this.pressed; this.pressed = null;
          if (source && source !== tab.id) run("tab.move", {id: source, index: index + 1});
          else run("tab.select", {id: tab.id});
        })
        .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); menu("tab", {id: tab.id, space: current.id}); })
        .child(label(`${index + 1}: ${name}${tab.zoomed ? " [Z]" : ""}`).max_w(180))
        .when(Boolean(tab.status), el => el.child(status(tab.status)))
        .when(tab.active, el => el.child(button(`close-${tab.id}`, "x", "Close tab", () => run("tab.close", {id: tab.id}))));
    });
    return h_flex().size_full().min_w(0).px(8).pl(left).gap(5).items_center().bg(t.chrome)
      .border_b(1).border_color(t.border).text_size(11)
      .on_mouse_up("left", () => {this.pressed = null;}).on_scroll_wheel(event => this.wheel(event))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(5)
        .overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change(() => { if (selected >= 0) this.scroll.scroll_to_item(selected); }).children(rows))
      .child(button("tab-new", "[+]", "New terminal or agent", () => openOverlay({mod: "new-menu", kind: "popup", width: 250, height: 512})))
      .children(enabled.map(id => button(`panel-${id}`, `[${id}]`, `Toggle ${id}`, () => {
        if (panel && !panel.hidden && stack?.active === id) run("layout.hide", {id: "panel"});
        else {run("layout.select", {stack: "panel-body", child: id}); run("layout.show", {id: "panel"});}
      }).text_color(panel && !panel.hidden && stack?.active === id ? t.accent : t.muted)))
      .when(Boolean(w?.buttons), el => el
        .child(button("minimize", "_", "Minimize window", () => run("window.minimize")))
        .child(button("maximize", w.maximized ? "[=]" : "[ ]", "Maximize or restore window", () => run("window.maximize")))
        .child(button("close-window", "[x]", "Close window", () => run("window.close"))));
  }
}
