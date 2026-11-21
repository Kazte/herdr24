import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import test from 'node:test';
import {mount, flatten, textOf, find, palette} from './harness.js';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const walk = node => [node, ...(node.children ?? []).flatMap(walk)];
const tab = (id, active = false) => ({id, name:id, named:true, active, status:null, index:1, panes:1});
const space = (id, active = true, machine = null) => ({id, name:id, active, machine, tabs:[tab(`${id}-tab`, true)], branch:'main'});
const pane = (id='p1') => ({pane:id, terminal:'t1', tab:'s1-tab', title:'shell', cwd:'/project', status:null, focused:true, zoomed:false});

test('package and default palette use the herdr24 identity', async () => {
  assert.equal((await json('package.json')).name, 'herdr24');
  const layout = await json('layouts/herdr24.json');
  assert.equal(layout.theme, 'herdr24-dark');
  await json('themes/herdr24-dark.json');
  for (const node of walk(layout)) {
    if (node.content?.mod && !['files', 'changes'].includes(node.content.mod)) {
      assert.match(node.content.mod, /^herdr24(?:-|$)/);
      await readFile(`mods/${node.content.mod}/main.js`);
    }
  }
});

test('runtime namespaces and mod directories contain only the new brand', async () => {
  for (const name of await readdir('mods')) {
    assert.match(name, /^herdr24(?:-|$)/);
    for (const file of (await readdir(`mods/${name}`)).filter(file => file.endsWith('.js'))) {
      assert.doesNotMatch(await readFile(`mods/${name}/${file}`, 'utf8'), /system24|sys24/i);
    }
  }
  for (const file of ['shared/ui.js', 'scripts/build-mods.js', 'scripts/check-mods.js']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /system24|sys24/i);
  }
});

test('README names herdr24 and explicitly credits system24 by refact0r', async () => {
  const readme = await readFile('README.md', 'utf8');
  assert.match(readme, /^# herdr24\n/);
  assert.match(readme, /Inspired by \[system24\]\(https:\/\/github\.com\/refact0r\/system24\) by \[refact0r\]\(https:\/\/github\.com\/refact0r\)/);
  assert.match(readme, /https:\/\/github\.com\/refact0r\/system24\/blob\/main\/theme\/system24\.theme\.css/);
});

// These contracts are deliberately written before the package exists.
test('layout preserves native IDs, functions, and a palette-independent square frame', async () => {
  const layout = await json('layouts/herdr24.json');
  assert.equal(layout.theme, 'herdr24-dark');
  assert.equal(layout.ui_font, 'Geist Mono');
  assert.equal(layout.font, 'Geist Mono');
  assert.equal(layout.colors, undefined);
  const nodes = walk(layout), ids = nodes.map(n=>n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['sidebar','panel','panel-body','files','changes']) assert.ok(ids.includes(id));
  const main = nodes.find(n=>n.content?.tab);
  assert.equal(main.content.pane.radius, 0);
  assert.equal(main.content.pane.focus.color, 'accent');
  assert.equal(main.content.pane.lone, true);
  for (const n of nodes) {
    assert.ok(!JSON.stringify(n).match(/#[0-9a-f]{6}/i), 'layout must not embed palette colors');
    if (n.content?.mod?.startsWith('herdr24')) await readFile(`mods/${n.content.mod}/main.js`);
  }
  for (const mod of ['files', 'changes']) assert.ok(nodes.some(n=>n.content?.mod===mod));
});

test('every theme provides valid terminal colors, semantic tokens, and 16 ANSI colors', async () => {
  for (const name of (await readdir('themes')).filter(name => name.endsWith('.json'))) {
  const theme = await json(`themes/${name}`);
  const hex = /^#[0-9a-f]{6}$/i;
  for (const key of ['background','foreground','selection','cursor']) assert.match(theme[key], hex);
  assert.equal(theme.ansi.length, 16);
  theme.ansi.forEach(color=>assert.match(color, hex));
  for (const key of Object.keys(palette()).filter(key=>!key.startsWith('ansi'))) {
    if (['background','foreground','selection','cursor'].includes(key)) continue;
    assert.match(theme.colors[key], hex, key);
  }
  }
});

test('all mods use native APIs, namespaced placement, no hardcoded colors or exec', async () => {
  for (const name of await readdir('mods')) {
    assert.match(name, /^herdr24(?:-|$)/);
    assert.equal((await json(`mods/${name}/mod.json`)).place, 'none');
    for (const file of (await readdir(`mods/${name}`)).filter(file=>file.endsWith('.js'))) {
      const source = await readFile(`mods/${name}/${file}`, 'utf8');
      assert.doesNotMatch(source, /#[0-9a-f]{6}|\b(exec|hc|fetch|setInterval|setTimeout)\s*\(/i);
    }
  }
});

test('all six chrome regions render empty states without side effects, also while checking', async () => {
  for (const name of ['herdr24','herdr24-spaces','herdr24-agents','herdr24-tabs','herdr24-pane','herdr24-status']) {
    const app = await mount(name, {checking:true});
    assert.ok(app.render());
    assert.equal(app.calls.length, 0, `${name} must not issue commands during check`);
    assert.equal(app.storage.size, 0);
  }
});

test('chrome exposes native Look settings, machine setup, search, and reversible sidebar rail', async () => {
  const app = await mount('herdr24');
  let tree = app.render();
  app.fire(tree,'search');
  assert.deepEqual(app.calls.at(-1),{command:'mod.open',args:{name:'picker'}});
  app.fire(tree,'sidebar-toggle');
  assert.equal(app.calls.at(-1).command,'layout.resize');
  app.state.props = {footer:true};
  tree = app.render();
  app.fire(tree,'settings');
  assert.deepEqual(app.calls.at(-1),{command:'app.settings',args:{section:'look'}});
  app.fire(tree,'machine');
  assert.deepEqual(app.calls.at(-1),{command:'mod.open',args:{name:'machine-add'}});
});

test('spaces select, reorder only within a machine, and retain native context menus', async () => {
  const all = [space('s1'),space('s2',false),space('r1',false,'remote')];
  const app = await mount('herdr24-spaces',{spaces:all});
  const tree = app.render();
  app.fire(tree,'space-s1','on_mouse_down:left'); app.fire(tree,'space-s1','on_mouse_up:left');
  assert.deepEqual(app.calls.at(-1),{command:'space.select',args:{id:'s1'}});
  app.fire(tree,'space-s1','on_mouse_down:left'); app.fire(tree,'space-s2','on_mouse_up:left');
  assert.deepEqual(app.calls.at(-1),{command:'space.move',args:{id:'s1',index:2}});
  const count = app.calls.length;
  app.fire(tree,'space-s1','on_mouse_down:left'); app.fire(tree,'space-r1','on_mouse_up:left');
  assert.equal(app.calls.length,count);
  app.fire(tree,'space-s2','on_mouse_down:right');
  assert.equal(app.overlays.at(-1).props.target.id,'s2');
});

test('agent rows prioritize urgent states, preserve pin/focus actions and keyboard order', async () => {
  const agents = ['idle','done','working','blocked'].map((status,i)=>({address:`t${i}`,pane:`p${i}`,title:status,
    status,space:'s1',space_name:'s1',tab:'s1-tab',pinned:false,program:{name:'Agent'}}));
  const app = await mount('herdr24-agents',{agents});
  const tree = app.render();
  assert.deepEqual(app.ordering.at(-1),['t3','t1','t2','t0']);
  for (const status of ['idle','done','working','blocked']) assert.ok(textOf(tree).includes(status));
  app.fire(tree,'agent-t3');
  assert.deepEqual(app.calls.at(-1),{command:'agent.focus',args:{terminal:'t3'}});
  app.fire(tree,'pin-t3');
  assert.deepEqual(app.calls.at(-1),{command:'terminal.pin',args:{terminal:'t3',pinned:true}});
});

test('tabs select, rename, close, reorder and open native launch menu', async () => {
  const s = space('s1'); s.tabs = [tab('a',true),tab('b')];
  const app = await mount('herdr24-tabs',{spaces:[s]});
  const tree=app.render();
  app.fire(tree,'tab-b','on_mouse_down:left',{click_count:1}); app.fire(tree,'tab-b','on_mouse_up:left');
  assert.deepEqual(app.calls.at(-1),{command:'tab.select',args:{id:'b'}});
  app.fire(tree,'tab-b','on_mouse_down:left',{click_count:2});
  assert.deepEqual(app.calls.at(-1),{command:'tab.rename',args:{id:'b'}});
  app.fire(tree,'tab-a','on_mouse_down:left'); app.fire(tree,'tab-b','on_mouse_up:left');
  assert.deepEqual(app.calls.at(-1),{command:'tab.move',args:{id:'a',index:2}});
  app.fire(tree,'close-a'); assert.equal(app.calls.at(-1).command,'tab.close');
  app.fire(tree,'tab-new'); assert.equal(app.overlays.at(-1).mod,'new-menu');
});

test('tabs toggle Files/Changes and restore each space panel without overwriting pending state', async () => {
  const layout={id:'root',children:[{id:'panel',hidden:true,children:[{id:'panel-body',active:'files'}]}]};
  const app=await mount('herdr24-tabs',{spaces:[space('s1')],layout});
  app.fire(app.render(),'panel-changes');
  assert.deepEqual(app.calls.slice(-2),[
    {command:'layout.select',args:{stack:'panel-body',child:'changes'}},{command:'layout.show',args:{id:'panel'}}]);
  layout.children[0].hidden=false; layout.children[0].children[0].active='changes'; app.render();
  app.state.spaces=[space('s2')]; app.render();
  assert.deepEqual(app.calls.at(-1),{command:'layout.hide',args:{id:'panel'}});
  layout.children[0].hidden=true; app.render();
  app.state.spaces=[space('s1')]; app.render();
  assert.deepEqual(app.calls.slice(-2),[
    {command:'layout.select',args:{stack:'panel-body',child:'changes'}},{command:'layout.show',args:{id:'panel'}}]);
});

test('pane controls target their own pane, not whichever terminal is focused', async () => {
  const app=await mount('herdr24-pane',{panes:[pane()],props:{pane:'p1',terminal:'t1'},focused:{pane:'other'}});
  const tree=app.render();
  for (const [id,command,args] of [
    ['split-right','pane.split',{pane:'p1',direction:'right'}],['split-down','pane.split',{pane:'p1',direction:'down'}],
    ['zoom','pane.zoom',{pane:'p1'}],['close-pane','pane.close',{pane:'p1'}]]) {
    app.fire(tree,id); assert.deepEqual(app.calls.at(-1),{command,args});
  }
});

test('palette changes propagate through every region without recreating the layout', async () => {
  for (const name of ['herdr24','herdr24-spaces','herdr24-agents','herdr24-tabs','herdr24-pane','herdr24-status']) {
    const app=await mount(name,{spaces:[space('s1')],panes:[pane()],props:{pane:'p1'},
      agents:[{address:'t1',title:'Agent',status:'blocked',space_name:'s1',program:{name:'Agent'}}]});
    app.render(); app.state.theme=palette('light');
    const nodes=flatten(app.render());
    for (const node of nodes) for (const method of ['bg','text_color','border_color']) {
      const color=node.styles[method]?.[0];
      if (color) assert.ok(color.startsWith('light:'),`${name}.${method}: ${color}`);
    }
  }
});

test('platform controls are conditional and macOS reserves traffic-light space even with sidebar hidden', async () => {
  const app=await mount('herdr24-tabs',{window:{platform:'macos',buttons:false,titlebar:'none',fullscreen:false},
    layout:{id:'root',traffic_lights:[12,16],children:[{id:'sidebar',hidden:true,size:{px:250}}]}});
  const tree=app.render();
  assert.equal(find(tree,'close-window'),undefined);
  assert.ok(tree.styles.pl[0]>=76);
  app.state.window={platform:'windows',buttons:true,maximized:true};
  app.fire(app.render(),'close-window');
  assert.equal(app.calls.at(-1).command,'window.close');
});

test('each deployable mod resolves helpers inside its own folder and ships current shared UI', async () => {
  const source=await readFile('shared/ui.js','utf8');
  for (const name of await readdir('mods')) {
    const main=await readFile(`mods/${name}/main.js`,'utf8');
    assert.doesNotMatch(main,/from\s+["']\.\.\//);
    assert.equal(await readFile(`mods/${name}/ui.js`,'utf8'),source);
  }
});

test('pinned agents remain first; grouping is selectable without changing focus', async () => {
  const app=await mount('herdr24-agents',{agents:[
    {address:'t1',status:'blocked',space_name:'z',program:{}},
    {address:'t2',status:'idle',space_name:'a',pinned:true,program:{}}]});
  const tree=app.render();
  assert.deepEqual(app.ordering.at(-1),['t2','t1']);
  app.fire(tree,'agent-sort');
  assert.equal(app.state.shared['herdr24.agents-grouped'],true);
  assert.equal(app.calls.length,0);
});

test('active tab panel preference waits for native restore and respects disabled panel options', async () => {
  const layout={id:'root',children:[{id:'panel',hidden:false,children:[{id:'panel-body',active:'files'}]}]};
  const app=await mount('herdr24-tabs',{spaces:[space('s1')],layout});
  app.render(); app.state.spaces=[space('s2')]; app.render();
  const stored=app.storage.get('panels');
  app.render();
  assert.equal(app.storage.get('panels'),stored,'old panel state must not become new space preference while restoring');
  app.state.shared['workspace.panels']=[];
  const tree=app.render();
  assert.equal(find(tree,'panel-files'),undefined); assert.equal(find(tree,'panel-changes'),undefined);
});

test('pane renders missing data safely and distinct agent statuses never depend on color alone', async () => {
  const app=await mount('herdr24-pane',{props:{pane:'gone'}});
  assert.equal(textOf(app.render()),'');
  for (const status of ['blocked','done','idle','working']) {
    app.state.panes=[{...pane(),status}]; app.state.props={pane:'p1'};
    const tree=app.render();
    if (status==='working') assert.ok(flatten(tree).some(node=>node.styles.frames));
    else assert.ok(textOf(tree).includes(status));
  }
});

test('macOS compact rail offers expansion below its reserved window buttons', async () => {
  const app=await mount('herdr24-agents',{window:{platform:'macos',buttons:false},
    layout:{id:'root',children:[{id:'sidebar',size:{px:76}}]}});
  app.fire(app.render(),'agent-expand');
  assert.deepEqual(app.calls.at(-1),{command:'layout.resize',args:{id:'sidebar',px:250}});
});

test('live blocked children without panes remain visible and peek at their exact machine address', async () => {
  const app=await mount('herdr24-agents',{agents:[
    {address:'build/t1',status:'idle',title:'Parent',space_name:'remote work',space:'remote-space',tab:'remote-tab',program:{name:'Agent'}}],
    terminals:[
      {address:'build/t1',state:'live',parent:null,status:'idle'},
      {address:'build/t2',state:'live',parent:'build/t1',status:'blocked',name:'Needs input'},
      {address:'other/t2',state:'live',parent:null,status:'blocked',name:'Unrelated'},
      {address:'build/old',state:'dead',parent:'build/t1',status:'blocked',name:'Ended'}]});
  const tree=app.render();
  assert.ok(textOf(tree).includes('Needs input'));
  assert.ok(textOf(find(tree,'agent-build/t2')).includes('[blocked]'));
  assert.deepEqual(app.ordering.at(-1),['build/t2','build/t1']);
  app.fire(tree,'agent-build/t2');
  assert.deepEqual(app.calls.at(-1),{command:'terminal.peek',args:{terminal:'build/t2'}});
  app.fire(tree,'agent-build/t1');
  assert.deepEqual(app.calls.at(-1),{command:'agent.focus',args:{terminal:'build/t1'}});
  assert.equal(find(tree,'agent-other/t2'),undefined);
  assert.equal(find(tree,'agent-build/old'),undefined);
});

test('kept child agents appear once and focus normally while their unkept descendants still peek', async () => {
  const app=await mount('herdr24-agents',{agents:[
    {address:'t1',status:'idle',title:'Parent',space_name:'work',program:{}},
    {address:'t2',status:'working',title:'Kept child',space_name:'work',program:{}}],
    terminals:[
      {address:'t1',state:'live',parent:null,status:'idle'},
      {address:'t2',state:'live',parent:'t1',status:'working'},
      {address:'t3',state:'live',parent:'t2',status:'blocked',name:'Grandchild'}]});
  const tree=app.render();
  assert.equal(flatten(tree).filter(node=>node.key==='agent-t2').length,1);
  assert.ok(find(tree,'agent-t3'));
  app.fire(tree,'agent-t2');
  assert.deepEqual(app.calls.at(-1),{command:'agent.focus',args:{terminal:'t2'}});
  app.fire(tree,'agent-t3');
  assert.deepEqual(app.calls.at(-1),{command:'terminal.peek',args:{terminal:'t3'}});
  assert.deepEqual(app.ordering.at(-1),['t3','t2','t1']);
});

test('cyclic or duplicate terminal ancestry cannot duplicate rows or recurse forever', async () => {
  const app=await mount('herdr24-agents',{agents:[
    {address:'t1',status:'idle',title:'Root',space_name:'work',program:{}}],
    terminals:[
      {address:'t1',state:'live',parent:'t2',status:'idle'},
      {address:'t2',state:'live',parent:'t1',status:'error',name:'Child'},
      {address:'t2',state:'live',parent:'t1',status:'error',name:'Duplicate'},
      {address:'t3',state:'live',parent:'t2',status:'done',name:'Finished child'}]});
  const tree=app.render();
  assert.deepEqual(app.ordering.at(-1),['t2','t1','t3']);
  for (const id of ['t1','t2','t3']) assert.equal(flatten(tree).filter(node=>node.key===`agent-${id}`).length,1);
  assert.ok(textOf(find(tree,'agent-t2')).includes('[blocked]'));
  assert.ok(textOf(find(tree,'agent-t3')).includes('[idle]'));
});
