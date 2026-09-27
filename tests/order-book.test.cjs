const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const i18n = require('../www/i18n.js');

const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
const KEY = 'order-list-maker-v1';

function page(t, oldState, failStorage = false, setup) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'https://orders.example/app/index.html',
    runScripts: 'dangerously',
    virtualConsole: console,
    beforeParse(win) {
      win.OrderBookI18n = i18n;
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      if (oldState) win.localStorage.setItem(KEY, JSON.stringify(oldState));
      if (failStorage) win.Storage.prototype.setItem = () => { throw Error('Storage unavailable'); };
      if (setup) setup(win);
    }
  });
  t.after(() => {
    dom.window.close();
    assert.deepEqual(errors, [], `Browser errors: ${errors.map(e => e.message).join(', ')}`);
  });
  const w = dom.window, d = w.document;
  return {
    w, d, $: id => d.getElementById(id),
    saved: () => JSON.parse(w.localStorage.getItem(KEY)),
    click: id => d.getElementById(id).click(),
    enter: (id, value) => {
      const input = d.getElementById(id);
      input.value = value;
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
    }
  };
}

test('generic defaults, expanded category picker and RIM suggestion work on a fresh install', t => {
  const p = page(t);
  assert.equal(p.$('shop').value, 'My Orders');
  assert.equal(p.$('orderNo').textContent, '#ORD-0001');
  assert.match(p.d.title, /Order App/);
  assert.equal(p.$('saveStatus').textContent, 'Saved on device');
  assert.equal(p.d.querySelector('.bar').hidden, true); // no useless footer covering categories
  for (const prefix of ['a', 'e']) {
    assert.deepEqual(Array.from(p.$(prefix + 'chips').querySelectorAll('button')).slice(0, 2).map(b => b.textContent), ['General', 'RIM']);
  }
  assert.ok(Array.from(p.$('cats').options).some(o => o.value === 'RIM'));
  p.$('achips').querySelectorAll('button')[1].click();
  assert.equal(p.$('acat').value, 'RIM');
  assert.equal(p.$('achips').querySelector('[aria-pressed="true"]').textContent, 'RIM');
});

test('add/edit/search/validate/reload and preserve custom categories after removal', async t => {
  const p = page(t);
  p.enter('orderCo', 'Default Supply');
  p.enter('aname', 'Wheel rim');
  p.$('achips').querySelectorAll('button')[1].click();
  p.enter('aqty', '-2');
  p.click('addBtn');
  assert.equal(p.$('stItems').firstChild.textContent, '0');
  assert.match(p.$('toast').textContent, /quantity/);
  p.enter('aqty', '2');
  p.click('addBtn');
  assert.equal(p.d.querySelector('.cat h3').textContent, 'RIM');
  assert.equal(p.d.querySelector('.bar').hidden, false);
  assert.equal(p.saved().items[0].cat, 'RIM');
  assert.equal(p.$('stUnits').firstChild.textContent, '2');

  p.enter('q', 'rim');
  assert.equal(p.d.querySelector('.cat').hidden, false);
  p.enter('q', 'default supply'); // the default company is omitted from the row label
  assert.equal(p.d.querySelector('.cat').hidden, false);
  p.enter('q', 'missing');
  assert.equal(p.d.querySelector('.cat').hidden, true);
  p.enter('q', '');
  p.d.querySelector('.item .info').click();
  p.enter('ecat', 'Custom Parts');
  p.click('eSave');
  assert.equal(p.d.querySelector('.cat h3').textContent, 'Custom Parts');
  assert.equal(p.saved().savedCategories.includes('Custom Parts'), true);
  p.d.querySelector('.item .del').click();
  await new Promise(resolve => setTimeout(resolve, 210));
  assert.equal(p.saved().items.length, 0);
  assert.ok(Array.from(p.$('achips').querySelectorAll('button')).some(b => b.textContent === 'Custom Parts'));

  const next = page(t, p.saved());
  assert.equal(next.$('shop').value, 'My Orders');
  assert.ok(Array.from(next.$('cats').options).some(o => o.value === 'Custom Parts'));
});

test('storage failure is visible instead of silently claiming the order was saved', t => {
  const p = page(t, null, true);
  assert.equal(p.$('saveStatus').textContent, 'Not saved');
  assert.match(p.$('savedPill').title, /lost/);
});

test('legacy orders migrate without losing items and custom titles remain unchanged', t => {
  const legacy = {
    shop: 'Saeedi Essence', phone: 'private', orderSeq: 4, orderCo: 'Old supplier',
    recentCos: ['Old supplier'], items: [{ name: 'Attar', cat: 'Old category', qty: 3, id: 'legacy' }]
  };
  const p = page(t, legacy);
  assert.equal(p.$('shop').value, 'My Orders');
  assert.equal(p.$('orderNo').textContent, '#ORD-0004');
  assert.equal(p.saved().items[0].name, 'Attar');
  assert.ok(p.saved().savedCategories.includes('Old category'));
  assert.equal(p.saved().phone, undefined);
  const custom = page(t, { ...legacy, shop: 'Any Shop' });
  assert.equal(custom.$('shop').value, 'Any Shop');
  const laterChoice = page(t, { ...legacy, brandMigrated: true });
  assert.equal(laterChoice.$('shop').value, 'Saeedi Essence'); // explicitly chosen after migration
});

test('special category/company names cannot break grouping or totals', t => {
  const p = page(t);
  p.enter('aname', 'Item A');
  p.enter('acat', '__proto__');
  p.enter('acompany', 'constructor');
  p.click('addBtn');
  p.enter('aname', 'Item B');
  p.enter('acat', 'toString');
  p.enter('acompany', '__proto__');
  p.click('addBtn');
  assert.equal(p.d.querySelectorAll('.cat').length, 2);
  p.click('gCo');
  assert.equal(p.d.querySelectorAll('.cat').length, 2);
  assert.equal(p.saved().items.length, 2);
});

test('all export methods use positive quantities and the selected group; print ignores search', t => {
  const p = page(t);
  p.enter('aname', 'RIM item');
  p.enter('acat', 'RIM');
  p.enter('aqty', '2');
  p.click('addBtn');
  p.enter('aname', 'Unordered item');
  p.enter('acat', 'RIM');
  p.enter('aqty', '0');
  p.click('addBtn');
  p.enter('aname', 'Home item');
  p.enter('acat', 'Home');
  p.enter('aqty', '1');
  p.click('addBtn');
  p.$('exportFilter').value = 'RIM';
  p.$('exportFilter').dispatchEvent(new p.w.Event('change'));
  p.click('textBtn');
  assert.match(p.$('out').value, /RIM item/);
  assert.doesNotMatch(p.$('out').value, /Unordered item|Home item/);
  assert.match(p.$('out').value, /TOTAL: 2 pcs/);
  p.enter('q', 'nonexistent');
  p.w.dispatchEvent(new p.w.Event('beforeprint'));
  const cards = Array.from(p.d.querySelectorAll('.cat'));
  assert.ok(cards.find(c => c.dataset.group === 'RIM').classList.contains('print-show'));
  assert.ok(cards.find(c => c.dataset.group === 'Home').classList.contains('print-hide'));
  assert.equal(p.d.querySelector('.tv').textContent, '2 pcs');
  p.w.dispatchEvent(new p.w.Event('afterprint'));
  assert.equal(p.d.querySelector('.tv').textContent, '3 pcs');
  p.click('gCo');
  assert.equal(p.$('exportFilter').value, '');
  assert.equal(p.saved().exportFilter, '');
});

test('long notes paginate pictures within the canvas limit; native share sends all pages together', async t => {
  const heights = [], writes = [], shares = [];
  const oldState = {
    shop: 'Order Book', orderSeq: 1, notes: Array(150).fill('X').join('\n'),
    items: Array.from({ length: 80 }, (_, i) => ({
      id: 'item-' + i, name: 'Part ' + i, cat: 'RIM', company: '', wt: '', wu: '', qty: 1, qu: 'pcs'
    }))
  };
  const p = page(t, oldState, false, win => {
    win.HTMLCanvasElement.prototype.getContext = () => new Proxy({
      measureText: text => ({ width: String(text).length * 12 })
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,aGVsbG8=';
    win.HTMLCanvasElement.prototype.toBlob = function (callback) {
      heights.push(this.height);
      callback(new win.Blob(['picture'], { type: 'image/png' }));
    };
    win.Capacitor = { Plugins: {
      Filesystem: { writeFile: async file => { writes.push(file); return { uri: 'file://' + file.path }; } },
      Share: { share: async params => { shares.push(params); } }
    } };
  });
  p.click('picBtn');
  await new Promise(resolve => setTimeout(resolve, 50));
  const parts = Number(p.$('picPages').textContent.match(/\d+/)[0]);
  assert.ok(parts > 1);
  assert.equal(heights.length, parts);
  assert.ok(heights.every(h => h <= 4200), `canvas heights: ${heights}`);
  p.click('picShare');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(writes.length, parts);
  assert.equal(shares.length, 1);
  assert.equal(shares[0].files.length, parts);
});

test('new order resets recipient, can undo, and keeps custom categories', t => {
  const p = page(t);
  p.enter('aname', 'Paper');
  p.enter('acat', 'Custom');
  p.click('addBtn');
  p.enter('orderCo', 'Company A');
  p.enter('notes', 'Deliver early');
  p.click('newBtn');
  p.click('newBtn');
  assert.equal(p.$('orderNo').textContent, '#ORD-0002');
  assert.equal(p.$('orderCo').value, '');
  assert.equal(p.$('notes').value, '');
  assert.equal(p.saved().items.length, 0);
  assert.ok(p.saved().savedCategories.includes('Custom'));
  p.$('toast').querySelector('button').click();
  assert.equal(p.$('orderNo').textContent, '#ORD-0001');
  assert.equal(p.$('orderCo').value, 'Company A');
  assert.equal(p.$('notes').value, 'Deliver early');
  assert.equal(p.saved().items[0].name, 'Paper');
});

test('device language, explicit language and RTL switch without changing saved category codes or item names', t => {
  const p = page(t, null, false, win => {
    Object.defineProperty(win.navigator, 'languages', { configurable: true, value: ['ur-PK', 'en-GB'] });
  });
  assert.equal(p.$('langPref').value, 'auto');
  assert.equal(p.d.documentElement.lang, 'ur-PK');
  assert.equal(p.d.documentElement.dir, 'rtl');
  assert.equal(p.$('shop').value, i18n.messages.ur.defaultTitle);
  assert.equal(p.$('achips').querySelector('button').textContent, i18n.categories.ur.General);
  p.enter('aname', 'Rim 1');
  p.enter('acat', i18n.categories.ur.General);
  p.click('addBtn');
  assert.equal(p.saved().items[0].cat, 'General');

  for (const lang of ['es', 'ar', 'en']) {
    p.$('langPref').value = lang;
    p.$('langPref').dispatchEvent(new p.w.Event('change', { bubbles: true }));
    assert.equal(p.saved().language, lang);
    assert.equal(p.d.documentElement.dir, lang === 'ar' ? 'rtl' : 'ltr');
    assert.equal(p.$('shop').value, i18n.messages[lang].defaultTitle);
    assert.equal(p.d.querySelector('.cat h3').textContent, i18n.categories[lang].General);
    assert.equal(p.$('aname').getAttribute('placeholder'), i18n.messages[lang].itemExample);
    assert.equal(p.saved().items[0].cat, 'General');
    assert.equal(p.saved().items[0].name, 'Rim 1');
  }
  p.$('langPref').value = 'ar';
  p.$('langPref').dispatchEvent(new p.w.Event('change'));
  const next = page(t, p.saved());
  assert.equal(next.d.documentElement.dir, 'rtl');
  assert.equal(next.$('langPref').value, 'ar');
  assert.equal(next.$('shop').value, i18n.messages.ar.defaultTitle);
});

test('unsupported device language falls back to English and dictionary entries remain complete', t => {
  const p = page(t, null, false, win => {
    Object.defineProperty(win.navigator, 'languages', { configurable: true, value: ['fr-FR', 'ja-JP'] });
  });
  assert.equal(p.d.documentElement.lang, 'en');
  assert.equal(p.d.documentElement.dir, 'ltr');
  const keys = Object.keys(i18n.messages.en).sort();
  for (const lang of ['ur', 'es', 'ar']) {
    assert.deepEqual(Object.keys(i18n.messages[lang]).sort(), keys, `${lang} message keys`);
    assert.deepEqual(Object.keys(i18n.categories[lang]).sort(), Object.keys(i18n.categories.en).sort());
    assert.deepEqual(Object.keys(i18n.units[lang]).sort(), Object.keys(i18n.units.en).sort());
  }
});

test('theme preferences persist and system mode returns control to the device', t => {
  const p = page(t);
  p.click('settingsBtn');
  assert.equal(p.$('settingsDlg').hasAttribute('open'), true);
  assert.equal(p.d.documentElement.hasAttribute('data-theme'), false);
  p.d.querySelector('input[name="theme"][value="dark"]').click();
  assert.equal(p.d.documentElement.dataset.theme, 'dark');
  assert.equal(p.saved().theme, 'dark');
  const next = page(t, p.saved());
  assert.equal(next.d.documentElement.dataset.theme, 'dark');
  assert.equal(next.d.querySelector('input[name="theme"][value="dark"]').checked, true);
  next.d.querySelector('input[name="theme"][value="light"]').click();
  assert.equal(next.d.documentElement.dataset.theme, 'light');
  assert.equal(next.saved().theme, 'light');
  next.d.querySelector('input[name="theme"][value="system"]').click();
  assert.equal(next.d.documentElement.hasAttribute('data-theme'), false);
  assert.equal(next.saved().theme, '');
});

test('category management validates names and preserves items, filters and selections on rename/delete', t => {
  const p = page(t);
  p.click('amanage');
  p.enter('newCategory', 'Custom parts');
  p.click('createCategory');
  assert.equal(p.$('acat').value, 'Custom parts');
  assert.deepEqual(p.saved().savedCategories, ['Custom parts']);
  assert.equal(p.d.querySelectorAll('.manage-row').length, 1);
  p.enter('newCategory', 'RIM');
  p.click('createCategory');
  assert.match(p.$('toast').textContent, /already exists/);
  assert.deepEqual(p.saved().savedCategories, ['Custom parts']);
  p.enter('newCategory', 'custom parts');
  p.click('createCategory');
  assert.deepEqual(p.saved().savedCategories, ['Custom parts']);
  p.click('closeCategories');

  p.enter('aname', 'Wheel');
  p.click('addBtn');
  assert.equal(p.saved().items[0].cat, 'Custom parts');
  p.$('exportFilter').value = 'Custom parts';
  p.$('exportFilter').dispatchEvent(new p.w.Event('change'));
  p.click('amanage');
  const row = () => p.d.querySelector('.manage-row');
  row().querySelector('input').value = 'Spare parts';
  row().querySelectorAll('button')[0].click();
  assert.equal(p.saved().items[0].cat, 'Spare parts');
  assert.deepEqual(p.saved().savedCategories, ['Spare parts']);
  assert.equal(p.saved().exportFilter, 'Spare parts');
  assert.equal(p.$('acat').value, 'Spare parts');
  assert.equal(p.d.querySelector('.cat h3').textContent, 'Spare parts');

  let prompted = 0;
  p.w.confirm = msg => { prompted++; assert.match(msg, /Spare parts/); return false; };
  row().querySelectorAll('button')[1].click();
  assert.equal(prompted, 1);
  assert.equal(p.saved().items[0].cat, 'Spare parts');
  p.w.confirm = () => true;
  row().querySelectorAll('button')[1].click();
  assert.deepEqual(p.saved().savedCategories, []);
  assert.equal(p.saved().items[0].cat, 'General');
  assert.equal(p.saved().exportFilter, '');
  assert.equal(p.$('acat').value, 'General');
  assert.equal(p.d.querySelector('.cat h3').textContent, 'General');
  assert.ok(Array.from(p.$('achips').querySelectorAll('button')).some(b => b.textContent === 'RIM'));
  const next = page(t, p.saved());
  assert.equal(next.d.querySelector('.cat h3').textContent, 'General');
  assert.deepEqual(next.saved().savedCategories, []);
});

test('category management from edit dialog changes the edited item and persists custom categories', t => {
  const p = page(t);
  p.enter('aname', 'Notebook'); p.click('addBtn');
  p.d.querySelector('.item .info').click();
  p.click('emanage');
  p.enter('newCategory', 'School supplies'); p.click('createCategory');
  assert.equal(p.$('ecat').value, 'School supplies');
  p.click('closeCategories');
  p.click('eSave');
  assert.equal(p.saved().items[0].cat, 'School supplies');
  assert.equal(p.d.querySelector('.cat h3').textContent, 'School supplies');
  assert.ok(p.saved().savedCategories.includes('School supplies'));
  const next = page(t, p.saved());
  assert.ok(Array.from(next.$('cats').options).some(o => o.value === 'School supplies'));
});

test('localized text, picture and PDF exports use translated labels and RTL canvas placement', async t => {
  for (const lang of ['ur', 'es', 'ar']) {
    const drawn = [], files = [];
    const p = page(t, null, false, win => {
      win.HTMLCanvasElement.prototype.getContext = () => new Proxy({
        measureText: text => ({ width: String(text).length * 12 }),
        fillText(text, x, y) { drawn.push({ text, x, y, font: this.font, align: this.textAlign, direction: this.direction }); }
      }, { get: (target, key) => key in target ? target[key] : () => {} });
      win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,aGVsbG8=';
      win.HTMLCanvasElement.prototype.toBlob = callback => callback(new win.Blob(['picture'], { type: 'image/png' }));
      win.URL.createObjectURL = blob => { files.push(blob); return 'blob:mock'; };
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = () => {}; // do not navigate in jsdom
    });
    p.$('langPref').value = lang;
    p.$('langPref').dispatchEvent(new p.w.Event('change'));
    p.enter('aname', 'Notebook');
    p.enter('acat', i18n.categories[lang].General);
    p.click('addBtn');
    p.enter('notes', 'Friday');
    p.click('textBtn');
    assert.match(p.$('out').value, new RegExp(i18n.messages[lang].exportQty));
    assert.match(p.$('out').value, new RegExp(i18n.messages[lang].exportTotal));
    assert.match(p.$('out').value, new RegExp(i18n.messages[lang].exportNotes));
    assert.match(p.$('out').value, /Notebook/);
    p.click('closeDlg');
    p.click('picBtn');
    await new Promise(resolve => setTimeout(resolve, 5));
    const rtl = lang !== 'es';
    const qty = drawn.find(line => line.text === i18n.messages[lang].exportQty);
    assert.ok(qty, `${lang} picture quantity header`);
    assert.equal(qty.direction, rtl ? 'rtl' : 'ltr');
    assert.equal(qty.x, rtl ? 72 : 1008);
    if (rtl) assert.match(qty.font, /Noto Naskh Arabic/);
    assert.ok(drawn.some(line => line.text === i18n.messages[lang].exportNotes.toUpperCase()));
    p.click('picClose');
    p.click('pdfBtn');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(files.length, 1, `${lang} PDF download`);
    assert.equal(files[0].type, 'application/pdf');
    assert.ok(files[0].size > 100);
    assert.ok(drawn.some(line => line.text === i18n.messages[lang].exportTotal), `${lang} PDF total`);
  }
});

test('typed title, supplier and notes are saved after a short pause and survive reload', async t => {
  const p = page(t);
  p.enter('shop', 'Local store');
  p.enter('orderCo', 'Supplier A');
  p.enter('notes', 'Deliver by Friday');
  assert.equal(p.$('saveStatus').textContent, 'Saving…');
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(p.$('saveStatus').textContent, 'Saved on device');
  const next = page(t, p.saved());
  assert.equal(next.$('shop').value, 'Local store');
  assert.equal(next.$('orderCo').value, 'Supplier A');
  assert.equal(next.$('notes').value, 'Deliver by Friday');
});

test('Order App branding is consistent without changing existing app identity or users’ custom titles', t => {
  const p = page(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../www/manifest.webmanifest'), 'utf8'));
  const native = JSON.parse(fs.readFileSync(path.join(__dirname, '../capacitor.config.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/build.yml'), 'utf8');
  assert.equal(manifest.short_name, 'Order App');
  assert.equal(native.appName, 'Order App');
  assert.equal(native.appId, 'com.saeedi.essence.orders');
  assert.match(workflow, /Order-App\.apk/);
  assert.equal(p.$('shop').value, 'My Orders'); // order title belongs to the user, not the app name
  assert.equal(p.$('shop').ownerDocument.querySelector('meta[name="apple-mobile-web-app-title"]').content, 'Order App');
  for (const lang of ['en', 'ur', 'es', 'ar']) {
    p.$('langPref').value = lang;
    p.$('langPref').dispatchEvent(new p.w.Event('change'));
    assert.match(p.d.title, /^Order App — /, `${lang} document title`);
    assert.match(p.d.querySelector('.foot').textContent, /^Order App · /, `${lang} footer`);
  }
  assert.ok(p.w.localStorage.getItem('order-list-maker-v1'));
  const legacyTitle = page(t, { shop: 'Order Book', titleCustomized: true, items: [] });
  assert.equal(legacyTitle.$('shop').value, 'Order Book'); // a custom title is never overwritten by rebranding
});

test('About Order App explains its audience, capabilities, storage and platforms in every language', t => {
  const p = page(t);
  p.click('settingsBtn');
  const details = p.$('aboutDetails');
  details.open = true;
  assert.equal(details.open, true);
  for (const lang of ['en', 'ur', 'es', 'ar']) {
    p.$('langPref').value = lang;
    p.$('langPref').dispatchEvent(new p.w.Event('change'));
    assert.equal(details.querySelector('summary').textContent, i18n.messages[lang].aboutSummary);
    assert.equal(details.querySelector('.about-copy').getAttribute('aria-label'), i18n.messages[lang].aboutSummary);
    for (const key of ['aboutAudienceTitle', 'aboutAudience', 'aboutFeaturesTitle', 'aboutFeatures', 'aboutPrivacyTitle', 'aboutPrivacy', 'aboutPlatformTitle', 'aboutPlatform']) {
      assert.equal(details.querySelector(`[data-i18n="${key}"]`).textContent, i18n.messages[lang][key], `${lang}: ${key}`);
    }
    assert.match(i18n.messages[lang].aboutFeatures, /RIM/);
    assert.equal(details.open, true, 'changing language should not collapse the information panel');
  }
  assert.equal(p.saved().language, 'ar');
  p.click('settingsClose');
});

test('manifest and cache include the current user-facing facts and localized About copy', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../www/manifest.webmanifest'), 'utf8'));
  const worker = fs.readFileSync(path.join(__dirname, '../www/sw.js'), 'utf8');
  assert.match(manifest.description, /home, shops and teams/);
  assert.match(manifest.description, /offline after your first visit/);
  assert.match(worker, /VERSION = '\d+\.\d+\.\d+'/, 'a cache version to invalidate the precache');
  assert.match(worker, /\.\/i18n\.js/);
  // the dictionary is critical: it must not lag behind a freshly fetched page
  assert.match(worker, /\/\\\/i18n\\\.js\$\//, 'i18n.js is fetched network-first');
});

test('every page exposes one top-level heading and a translated order-number label', t => {
  const p = page(t);
  const headings = p.d.querySelectorAll('h1');
  assert.equal(headings.length, 1, 'expected exactly one h1');
  assert.match(headings[0].className, /sr-only/, 'the h1 must not print on the hero');
  for (const lang of ['en', 'ur', 'es', 'ar']) {
    p.$('langPref').value = lang;
    p.$('langPref').dispatchEvent(new p.w.Event('change'));
    assert.equal(headings[0].textContent, i18n.messages[lang].appTitle, `${lang} heading`);
    assert.equal(p.$('orderNo').getAttribute('title'), i18n.messages[lang].orderNumber, `${lang} order number label`);
    assert.match(i18n.messages[lang].orderNumber, /\S/);
  }
});

test('native controls and browser chrome follow the chosen theme', t => {
  const css = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  assert.match(css, /:root \{\s*color-scheme: light;/, 'light color-scheme');
  assert.match(css, /:root\[data-theme="dark"\] \{\s*color-scheme: dark;/, 'explicit dark color-scheme');
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \{\s*color-scheme: dark;/, 'device dark color-scheme');
  const p = page(t);
  const meta = () => p.d.querySelector('meta[name="theme-color"]').getAttribute('content');
  const pick = value => {
    const radio = p.d.querySelector(`input[name="theme"][value="${value}"]`);
    radio.checked = true;
    radio.dispatchEvent(new p.w.Event('change', { bubbles: true }));
  };
  assert.equal(meta(), '#16302A', 'light hero colour by default');
  pick('dark');
  assert.equal(meta(), '#14231D', 'dark hero colour');
  pick('light');
  assert.equal(meta(), '#16302A');
  pick('system');
  assert.equal(meta(), '#16302A', 'device setting hands the colour back to the device');
});

test('deleting a custom category also frees its colour slot', t => {
  const p = page(t);
  p.w.confirm = () => true;
  p.enter('aname', 'Rim tape');
  p.enter('acat', 'Spares');
  p.click('addBtn');
  assert.equal(p.saved().items[0].cat, 'Spares');
  assert.ok(p.saved().catOrder.indexOf('Spares') !== -1, 'rendering the group records its colour slot');
  p.click('amanage');
  const row = Array.from(p.d.querySelectorAll('#categoryManageList .manage-row'))
    .find(r => r.querySelector('input').value === 'Spares');
  assert.ok(row, 'the custom category should be listed');
  row.querySelectorAll('button')[1].click(); // Delete
  assert.equal(p.saved().items[0].cat, 'General');
  assert.ok(p.saved().catOrder.indexOf('Spares') === -1, 'the colour map should not keep deleted categories');
  assert.ok(p.saved().savedCategories.indexOf('Spares') === -1);
});

test('static assets revalidate in the background so updates reach returning visitors', () => {
  const worker = fs.readFileSync(path.join(__dirname, '../www/sw.js'), 'utf8');
  assert.match(worker, /stale-while-revalidate/i);
  const assetBranch = worker.slice(worker.indexOf('e.respondWith(caches.match(req)'));
  assert.ok(assetBranch.length, 'expected a cache lookup branch for assets');
  assert.match(assetBranch, /fetch\(req\)/, 'assets must still be refreshed from the network');
  assert.match(assetBranch, /c\.put\(req, cp\)/, 'the fresh copy must replace the cached one');
  assert.match(assetBranch, /return r \|\| network;/, 'the cache is served first, the network backs it up');
  assert.match(worker, /var networkFirst = /, 'the page and dictionary are network-first');
  assert.match(worker, /c\.add\(f\)\.catch/, 'one missing file must not abort the whole precache');
});

test('manifest keeps a stable install identity and declares language and categories', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../www/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, manifest.start_url, 'the id must match start_url so existing installs are not duplicated');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.lang, 'en');
  assert.equal(manifest.dir, 'ltr');
  assert.deepEqual(manifest.categories, ['productivity', 'utilities']);
  assert.match(manifest.name, /Order App/);
});

test('a visitor without JavaScript is told why the page is empty', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const notice = html.match(/<noscript>([\s\S]*?)<\/noscript>/);
  assert.ok(notice, 'expected a <noscript> notice');
  assert.match(notice[1], /needs JavaScript/i);
});

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

test('a backup file carries the whole order and loads back onto a cleared device', async t => {
  let blob = null;
  const p = page(t, null, false, win => {
    win.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
    win.URL.revokeObjectURL = () => {};
    // jsdom tries to navigate for <a download>; real browsers simply download.
    win.HTMLAnchorElement.prototype.click = function () {};
  });
  p.enter('shop', 'Karachi Motors');
  p.enter('orderCo', 'Acme Traders');
  p.enter('notes', 'Deliver by Friday');
  p.enter('aname', 'Wheel rim');
  p.enter('acat', 'RIM');
  p.enter('aqty', '3');
  p.click('addBtn');
  p.enter('aname', 'Spare bolt');
  p.enter('acat', 'Spares');
  p.click('addBtn');

  p.click('settingsBtn');
  p.click('backupBtn');
  assert.ok(blob, 'saving a backup should produce a file');
  const text = await new Promise(resolve => {
    const reader = new p.w.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  const backup = JSON.parse(text);
  assert.equal(backup.app, 'order-app');
  assert.equal(backup.format, 1);
  assert.match(backup.exportedAt, /^\d{4}-/);
  assert.equal(backup.state.items.length, 2);
  assert.equal(backup.state.shop, 'Karachi Motors');
  assert.equal(backup.state.orderCo, 'Acme Traders');
  assert.equal(backup.state.notes, 'Deliver by Friday');
  assert.deepEqual(backup.state.savedCategories, ['Spares'], 'custom categories travel with the backup');

  // clear everything, then load the backup back in
  p.click('settingsClose');
  p.click('clearBtn'); p.click('clearBtn');
  assert.equal(p.saved().items.length, 0);
  p.click('settingsBtn');
  const field = p.$('restoreFile');
  p.w.confirm = () => true;
  Object.defineProperty(field, 'files', {
    configurable: true,
    value: [new p.w.File([text], 'order-app-backup.json', { type: 'application/json' })]
  });
  field.dispatchEvent(new p.w.Event('change'));
  await tick(120);

  assert.equal(p.saved().items.length, 2, 'the backup should come back');
  assert.deepEqual(p.saved().items.map(i => i.name), ['Wheel rim', 'Spare bolt']);
  assert.equal(p.saved().items[0].qty, 3);
  assert.equal(p.saved().items[1].cat, 'Spares');
  assert.equal(p.$('shop').value, 'Karachi Motors', 'the order title is restored into the form');
  assert.equal(p.$('orderCo').value, 'Acme Traders');
  assert.equal(p.$('notes').value, 'Deliver by Friday');
  assert.equal(p.$('settingsDlg').open, false, 'the settings dialog closes so the result is visible');

  // restoring replaces the list, so it offers the usual undo of what was there before
  const undo = p.$('toast').querySelector('button');
  assert.ok(undo, 'restoring should offer an undo');
  undo.click();
  assert.equal(p.saved().items.length, 0, 'undo puts the previous, cleared list back');
});

test('a file that is not a backup is refused without touching the current order', async t => {
  const p = page(t);
  p.w.confirm = () => true;
  p.enter('aname', 'Keep me');
  p.click('addBtn');
  p.click('settingsBtn');
  const field = p.$('restoreFile');
  Object.defineProperty(field, 'files', {
    configurable: true,
    value: [new p.w.File(['{"hello":"world"}'], 'holiday-photo.json', { type: 'application/json' })]
  });
  field.dispatchEvent(new p.w.Event('change'));
  await tick(120);
  assert.equal(p.saved().items.length, 1);
  assert.equal(p.saved().items[0].name, 'Keep me');
  assert.match(p.$('toast').textContent, /not an Order App backup/);
});

test('back closes the open dialog, and closing by button steps back exactly once', async t => {
  const p = page(t);
  const pageEntry = p.w.history.state; // null on a freshly opened page
  p.click('settingsBtn');
  assert.equal(p.$('settingsDlg').open, true);
  assert.equal(p.w.history.state.orderAppDialog, true, 'an open dialog adds one history entry');
  p.w.history.back();
  await tick();
  assert.equal(p.$('settingsDlg').open, false, 'back should close the dialog instead of leaving the page');
  assert.equal(p.w.history.state, pageEntry, 'back lands on the page entry again');

  // Closing with the dialog's own button releases its entry: exactly one step back.
  let pops = 0;
  p.w.addEventListener('popstate', () => { pops++; });
  p.click('settingsBtn');
  assert.equal(p.w.history.state.orderAppDialog, true);
  p.click('settingsClose');
  await tick();
  assert.equal(p.$('settingsDlg').open, false);
  assert.equal(pops, 1, 'closing by button steps back over its own entry exactly once');

  // The delayed popstate that release causes must not reach a dialog opened
  // straight afterwards, or the next Back press would need pressing twice.
  p.click('settingsBtn');
  await tick();
  assert.equal(p.$('settingsDlg').open, true, 'a late popstate must not close a freshly opened dialog');
  assert.equal(p.w.history.state.orderAppDialog, true);
});

test('feedback raised while a dialog is open is placed in the top layer with it', t => {
  const p = page(t);
  p.click('amanage');
  p.enter('newCategory', 'Spares');
  p.click('createCategory');
  const toastEl = p.$('toast');
  assert.equal(toastEl.hidden, false);
  assert.ok(toastEl.closest('dialog'), 'a toast must sit inside the modal, not behind its backdrop');
  assert.equal(toastEl.closest('dialog').id, 'categoryDlg');
  assert.match(toastEl.textContent, /Category added/);
  p.click('closeCategories');
  p.click('picSave'); // nothing prepared yet: toasts with no dialog open
  assert.equal(toastEl.parentNode, p.d.body, 'with no dialog open the toast belongs to the page');
});

test('printing names the page after the order and restores the app title afterwards', t => {
  const p = page(t);
  const appTitle = p.d.title;
  p.enter('shop', 'Karachi Motors');
  p.w.dispatchEvent(new p.w.Event('beforeprint'));
  assert.equal(p.d.title, 'Karachi Motors', 'the printed header should name the order');
  p.w.dispatchEvent(new p.w.Event('afterprint'));
  assert.equal(p.d.title, appTitle);
});

test('the Android hardware back button closes the open dialog before exiting the app', t => {
  let backHandler = null;
  let exited = 0;
  const p = page(t, null, false, win => {
    win.Capacitor = { Plugins: { App: {
      addListener: (name, cb) => { if (name === 'backButton') backHandler = cb; },
      exitApp: () => { exited++; }
    } } };
  });
  assert.ok(backHandler, 'the native back button must be handled at startup');
  p.click('settingsBtn');
  assert.equal(p.$('settingsDlg').open, true);
  backHandler();
  assert.equal(p.$('settingsDlg').open, false, 'back should close the dialog first');
  assert.equal(exited, 0, 'the app must not exit while a dialog was open');
  backHandler();
  assert.equal(exited, 1, 'with nothing open, back exits as Android users expect');
});

