import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {mount, flatten} from './harness.js';

const bundled = ['herdr24-dark', 'herdr24-light', 'kanagawa-dragon', 'kanagawa-dragon-light', 'carbonfox'];
const added = ['herdr24-light', 'kanagawa-dragon', 'kanagawa-dragon-light'];
const json = async name => JSON.parse(await readFile(`themes/${name}.json`, 'utf8'));
const luminance = hex => {
  const [r, g, b] = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05)
  / (Math.min(luminance(a), luminance(b)) + 0.05);
const runtime = theme => ({...theme, ...theme.colors,
  ...Object.fromEntries(theme.ansi.map((value, index) => [`ansi${index}`, value]))});

test('bundled themes have readable primary text in their intended appearance mode', async () => {
  const files = await readdir('themes');
  for (const name of bundled) {
    assert.ok(files.includes(`${name}.json`), `Missing bundled palette: ${name}`);
    const theme = await json(name);
    assert.equal(luminance(theme.background) > 0.5, name.endsWith('-light'), name);
    assert.ok(contrast(theme.foreground, theme.background) >= 4.5, `${name}: terminal text`);
    for (const surface of ['canvas', 'chrome', 'surface', 'popover', 'raised', 'hover', 'selected']) {
      assert.ok(contrast(theme.foreground, theme.colors[surface]) >= 4.5, `${name}: text on ${surface}`);
    }
    for (const fill of ['accent', 'solid']) {
      assert.ok(contrast(theme.colors[fill], theme.colors[`${fill}_foreground`]) >= 4.5,
        `${name}: ${fill} text`);
    }
  }
});

test('Carbonfox is dark-only and retains the official Nightfox terminal export', async () => {
  const theme = await json('carbonfox');
  assert.equal(theme.background, '#161616');
  assert.equal(theme.foreground, '#f2f4f8');
  assert.equal(theme.cursor, '#f2f4f8');
  assert.equal(theme.selection, '#2a2a2a');
  assert.deepEqual(theme.ansi, ['#282828', '#ee5396', '#25be6a', '#08bdba', '#78a9ff', '#be95ff',
    '#33b1ff', '#dfdfe0', '#484848', '#f16da6', '#46c880', '#2dc7c4', '#8cb6ff', '#c8a5ff', '#52bdff', '#e4e4e5']);
  assert.ok(!(await readdir('themes')).some(name => /^carbonfox.*light/i.test(name)));
  const readme = await readFile('README.md', 'utf8');
  assert.match(readme, /`carbonfox`\s*\|\s*Dark only/);
  assert.match(readme, /https:\/\/github.com\/EdenEast\/nightfox.nvim\/blob\/main\/extra\/carbonfox\/carbonfox.ghostty/);
  const license = await readFile('licenses/nightfox.nvim-MIT.txt', 'utf8');
  assert.match(license, /Copyright \(c\) 2021 James Simpson/);
  assert.match(license, /Permission is hereby granted/);
});

test('Kanagawa terminal palettes retain the official Dragon and Lotus colors', async () => {
  // First 16 term entries in rebelot/kanagawa.nvim lua/kanagawa/themes.lua.
  const dragon = await json('kanagawa-dragon');
  assert.equal(dragon.background, '#181616');
  assert.equal(dragon.foreground, '#c5c9c5');
  assert.deepEqual(dragon.ansi, ['#0d0c0c', '#c4746e', '#8a9a7b', '#c4b28a', '#8ba4b0', '#a292a3',
    '#8ea4a2', '#c8c093', '#a6a69c', '#e46876', '#87a987', '#e6c384', '#7fb4ca', '#938aa9', '#7aa89f', '#c5c9c5']);
  const light = await json('kanagawa-dragon-light');
  assert.equal(light.background, '#f2ecbc');
  assert.equal(light.foreground, '#545464');
  assert.deepEqual(light.ansi, ['#1f1f28', '#c84053', '#6f894e', '#77713f', '#4d699b', '#b35b79',
    '#597b75', '#545464', '#8a8980', '#d7474b', '#6e915f', '#836f4a', '#6693bf', '#624c83', '#5e857a', '#43436c']);
});

test('all bundled palettes drive the six native regions without stale colors', async () => {
  for (const name of ['herdr24', 'herdr24-spaces', 'herdr24-agents', 'herdr24-tabs', 'herdr24-pane', 'herdr24-status']) {
    const app = await mount(name, {checking: true,
      spaces: [{id: 's1', name: 'Work', active: true, tabs: [{id: 'tab', name: 'Shell', active: true}]}],
      panes: [{pane: 'p1', terminal: 't1', title: 'Shell', focused: true, status: 'working'}],
      agents: [{address: 't1', title: 'Agent', status: 'blocked', space_name: 'Work', program: {}}],
      props: {pane: 'p1'}});
    for (const themeName of bundled) {
      const selected = runtime(await json(themeName));
      app.state.theme = selected;
      const tree = app.render();
      const colors = new Set(Object.values(selected).filter(value => typeof value === 'string'));
      let styled = 0;
      for (const node of flatten(tree)) for (const method of ['bg', 'text_color', 'border_color']) {
        const value = node.styles[method]?.[0];
        if (value) { styled++; assert.ok(colors.has(value), `${name}/${themeName}: stale ${method} ${value}`); }
      }
      assert.ok(styled > 0, `${name}/${themeName} did not render colored content`);
      assert.equal(app.calls.length, 0);
    }
  }
});

test('theme documentation identifies the Lotus-derived light counterpart and upstream license', async () => {
  const readme = await readFile('README.md', 'utf8');
  for (const name of bundled) assert.ok(readme.includes(`\`${name}\``), name);
  assert.match(readme, /Lotus-derived/);
  assert.match(readme, /https:\/\/github.com\/rebelot\/kanagawa.nvim/);
  assert.doesNotMatch(readme, /supplies one dark palette/);
  const license = await readFile('licenses/kanagawa.nvim-MIT.txt', 'utf8');
  assert.match(license, /Copyright \(c\) 2021 Tommaso Laurenzi/);
  assert.match(license, /Permission is hereby granted/);
});

test('documented full and additive installers copy palettes safely and parse in Fish', async t => {
  const readme = await readFile('README.md', 'utf8');
  const snippets = [...readme.matchAll(/```sh\n(bash -c '[\s\S]*?')\n```/g)].map(match => match[1]);
  assert.equal(snippets.length, 3, 'Expected full install, original palette update, and Carbonfox update');
  const root = await mkdtemp(path.resolve('.theme-install-test-'));
  try {
    for (const [index, snippet] of snippets.entries()) {
      const file = path.join(root, `snippet-${index}.sh`);
      await writeFile(file, snippet);
      for (const shell of ['bash', 'fish']) {
        const result = spawnSync(shell, ['-n', file], {encoding: 'utf8'});
        if (shell === 'fish' && result.error?.code === 'ENOENT') {
          t.diagnostic('Fish is not installed; optional Fish syntax check skipped');
          continue;
        }
        assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
      }
      const home = path.join(root, `home-${index}`);
      const env = {...process.env, HERDR_APP_HOME: home};
      const result = spawnSync('bash', [file], {env, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      const installed = index === 0 ? bundled : snippet.includes('for theme in') ? added : ['carbonfox'];
      for (const name of installed) {
        assert.equal(await readFile(path.join(home, 'themes', `${name}.json`), 'utf8'),
          await readFile(`themes/${name}.json`, 'utf8'));
      }
      if (index > 0) {
        assert.deepEqual(await readdir(home), ['themes'], 'Additive install touches themes only');
        assert.deepEqual((await readdir(path.join(home, 'themes'))).sort(), installed.map(name => `${name}.json`).sort());
      }
      const collision = path.join(root, `collision-${index}`);
      await mkdir(path.join(collision, 'themes'), {recursive: true});
      const collisionName = installed.includes('kanagawa-dragon') ? 'kanagawa-dragon.json' : 'carbonfox.json';
      const existing = path.join(collision, 'themes', collisionName);
      await writeFile(existing, 'keep existing palette');
      const blocked = spawnSync('bash', [file], {env: {...env, HERDR_APP_HOME: collision}, encoding: 'utf8'});
      assert.notEqual(blocked.status, 0, 'Installer must refuse existing names');
      assert.equal(await readFile(existing, 'utf8'), 'keep existing palette');
      assert.deepEqual(await readdir(collision), ['themes']);
      assert.deepEqual(await readdir(path.join(collision, 'themes')), [collisionName],
        'Collision preflight must happen before any copy');
      if (installed.length === 1) {
        const previous = path.join(root, 'existing-install');
        await mkdir(path.join(previous, 'themes'), {recursive: true});
        await mkdir(path.join(previous, 'layouts'));
        const layoutFile = path.join(previous, 'layouts', 'herdr24.json');
        await writeFile(layoutFile, 'keep existing layout');
        for (const name of bundled.filter(name => name !== 'carbonfox')) {
          await writeFile(path.join(previous, 'themes', `${name}.json`), `keep ${name}`);
        }
        const update = spawnSync('bash', [file], {env: {...env, HERDR_APP_HOME: previous}, encoding: 'utf8'});
        assert.equal(update.status, 0, update.stderr);
        assert.equal(await readFile(layoutFile, 'utf8'), 'keep existing layout');
        for (const name of bundled.filter(name => name !== 'carbonfox')) {
          assert.equal(await readFile(path.join(previous, 'themes', `${name}.json`), 'utf8'), `keep ${name}`);
        }
        assert.equal(await readFile(path.join(previous, 'themes', 'carbonfox.json'), 'utf8'),
          await readFile('themes/carbonfox.json', 'utf8'));
      }
    }
  } finally { await rm(root, {recursive: true, force: true}); }
});
