import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

// Model only documented native primitives; unknown methods fail rather than hiding typos.
const methods = new Set(('size_full min_w min_h flex_1 flex_none flex_auto w h size w_full h_full max_w '
  + 'p px py pl pr pt pb gap items_center justify_center justify_between flex text_size text_color '
  + 'font_medium font_semibold font_family bg border border_l border_b border_t border_color rounded '
  + 'truncate overflow_y_scrollbar overflow_x_scrollbar track_scroll tooltip accessibility_label '
  + 'cursor_pointer opacity relative absolute left right top bottom frames').split(' '));
export class Element {
  constructor(kind = 'div') { this.kind = kind; this.nodes = []; this.styles = {}; this.events = {}; }
  id(id) { this.key = id; return this; }
  child(value) { if (value !== null && value !== undefined) this.nodes.push(value); return this; }
  children(values) { for (const value of values.flat(Infinity)) this.child(value); return this; }
  when(value, fn) { return value ? fn(this) : this; }
  hover(fn) { const style = element(); fn(style); this.hoverStyle = style; return this; }
}
for (const method of methods) Element.prototype[method] = function (...args) { this.styles[method] = args; return this; };
for (const event of ['on_click', 'on_size_change', 'on_hover', 'on_scroll_wheel', 'on_mouse_move']) {
  Element.prototype[event] = function (fn) { this.events[event] = fn; return this; };
}
for (const event of ['on_mouse_down', 'on_mouse_up']) {
  Element.prototype[event] = function (button, fn) { this.events[`${event}:${button}`] = fn; return this; };
}
export const element = (kind) => new Element(kind);
export const flatten = (tree) => tree instanceof Element ? [tree, ...tree.nodes.flatMap(flatten)] : [];
export const textOf = (tree) => tree instanceof Element ? tree.nodes.map(textOf).join(' ') : String(tree ?? '');
export const find = (tree, id) => flatten(tree).find(node => node.key === id);
export const palette = (prefix = 'dark') => Object.fromEntries(
  ['background','foreground','selection','cursor','canvas','chrome','surface','popover','raised','hover',
    'selected','border','input','muted','dim','accent','accent_foreground','solid','solid_foreground',
    'working','blocked','done','idle','unknown', ...Array.from({length:16}, (_,i)=>`ansi${i}`)]
    .map(key => [key, `${prefix}:${key}`]));

export async function mount(name, overrides = {}) {
  const state = { spaces: [], agents: [], panes: [], terminals: [], machines: [{ name: null, layout: 'ready' }],
    focused: null, props: {}, theme: palette(), window: {platform:'linux', buttons:true, fullscreen:false,
      maximized:false, titlebar:'none'}, layout: {id:'root', type:'row', children: []}, checking:false,
    settings: {zoom:1}, shared: {}, keys: [], ...overrides };
  const calls = [], overlays = [], ordering = [], storage = new Map();
  const context = vm.createContext({ console, localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value),
    removeItem: key => storage.delete(key),
  }});
  const native = Object.fromEntries(['spaces','agents','panes','terminals','machines','focused','props','theme','window',
    'layout','checking','settings','keys'].map(key => [key, () => state[key]]));
  Object.assign(native, {
    run: (command, args) => calls.push({command, args: args === undefined ? undefined : JSON.parse(JSON.stringify(args))}),
    openOverlay: spec => {overlays.push(spec); return 'overlay';},
    setAgentOrder: list => ordering.push(Array.from(list)),
    shared: key => state.shared[key], setShared: (key,value) => {state.shared[key] = value;},
  });
  const libraries = {
    'gpui-kit': {View: class {}, div: () => element('div')},
    'gpui-base': {h_flex: () => element('h_flex'), v_flex: () => element('v_flex'),
      ScrollHandle: {new: () => ({scroll_to_item() {}})}},
    herdr: native,
  };
  const modules = new Map();
  async function load(file) {
    if (modules.has(file)) return modules.get(file);
    const library = libraries[file];
    const mod = library ? new vm.SyntheticModule(Object.keys(library), function () {
      for (const [key, value] of Object.entries(library)) this.setExport(key, value);
    }, {context}) : new vm.SourceTextModule(await readFile(file, 'utf8'), {context, identifier:file});
    modules.set(file, mod);
    await mod.link((specifier, ref) => load(libraries[specifier] ? specifier : path.resolve(path.dirname(ref.identifier), specifier)));
    return mod;
  }
  const mod = await load(path.resolve('mods', name, 'main.js'));
  await mod.evaluate();
  const view = new mod.namespace.default();
  const cx = {stop_propagation() {}, notify() {}, timer:{every() { throw Error('No polling expected'); }}};
  view.init?.(state.props, cx);
  return {state, view, cx, calls, overlays, ordering, storage, render: () => view.render(cx),
    fire(tree, id, event = 'on_click', data = {}) {
      const node = find(tree, id);
      if (!node) throw Error(`Missing control: ${id}`);
      const handler = node.events[event];
      if (!handler) throw Error(`Missing handler: ${id}.${event}`);
      handler(data, cx);
    }};
}
