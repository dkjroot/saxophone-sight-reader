const assert = require('node:assert/strict');

module.exports = async function workspaceChecks(browser, midiPage) {
  const {context,page,errors,set,send,connect} = await midiPage(browser, {viewport:{width:1440,height:900}});
  try {
    const bounds = selector => page.locator(selector).evaluate(node => {
      const {left,width} = node.getBoundingClientRect();
      return {left,width};
    });
    const settings = await bounds('.settings-grid');
    await page.locator('#staff-panel .layout-resize').focus();
    for (let i=0; i<15; i++) await page.keyboard.press('Shift+ArrowRight');
    assert.deepEqual(await bounds('.settings-grid'), settings);
    assert.ok((await bounds('#staff-panel')).width > settings.width);
    await page.selectOption('#density','auto');

    await page.selectOption('#file-offset','-9');
    await page.locator('#library-search').fill('Swing Low');
    await page.selectOption('#library-piece','swing-low-refrain');
    await page.locator('#load-piece').click();
    await page.waitForFunction(() => document.getElementById('score-status').textContent.includes('Swing Low'));
    assert.equal(await page.locator('#source').inputValue(), 'random');
    assert.equal(await page.locator('#file-offset').isVisible(), false);
    assert.match(await page.locator('#library-credit').innerText(), /D4–D5/);
    await page.locator('#practice-score').click();
    assert.equal(await page.locator('.note[data-step="0"]').getAttribute('data-midi'), '71');
    assert.equal(await page.locator('#key').inputValue(), 'G');
    await page.locator('#mode-study').click();
    await page.waitForFunction(() => document.getElementById('practice-title').textContent.includes('Swing Low'));
    assert.equal(await page.locator('.vf-stave').count(), 8);
    assert.equal(await page.locator('[data-tempo-bpm]').first().textContent(), '♩ = 78');
    await page.locator('#staff-panel').screenshot({path:'test-results/sax-library-study.png'});
    await page.locator('#mode-outline').click();
    await page.selectOption('#source','random');

    await page.locator('#score-file').setInputFiles('tests/fixtures/polyphony.mid');
    await page.waitForFunction(() => !document.getElementById('practice-score').disabled);
    assert.equal(await page.locator('#source').inputValue(), 'random', 'loading a preview preserves active practice');
    assert.equal(await page.locator('#file-offset').inputValue(), '-9');
    assert.equal(await page.locator('#file-offset').isVisible(), true);
    await page.selectOption('#file-offset','-9');
    await page.locator('#practice-score').click();
    assert.equal(await page.locator('#source').inputValue(), 'midi');
    assert.equal(await page.locator('.note[data-step="0"]').getAttribute('data-midi'), '73');
    assert.equal(await page.locator('.note[data-step="0"]').count(), 1);
    assert.match(await page.locator('#outline-status').innerText(), /omitted/);

    await page.locator('#passage-end').fill('1');
    await page.locator('#passage-end').dispatchEvent('change');
    await page.locator('#save-passage').click();
    assert.match(await page.locator('#passage-status').innerText(), /saved/i);
    await page.locator('#end-new').check();
    await connect();
    await send([0x90,73,100]);
    await page.waitForFunction(() => document.getElementById('score-playing').textContent.includes('source attacks 2–2'));
    await send([0x90,76,100]);
    await page.waitForFunction(() => document.getElementById('feedback').textContent === '✓ Passage complete');
    await send([0x80,76,0]);
    await page.locator('#play-source').click();
    await page.waitForFunction(() => document.getElementById('source-playback-status').textContent.includes('Playing'));
    await page.locator('#stop-source').click();

    await page.selectOption('#source','random');
    await set({low:60,high:60,key:'C'});
    await page.locator('#end-repeat').check();
    assert.equal(await page.locator('.ledger').count() >= 1, true);
    const note = page.locator('.key[data-pitch="60"]');
    await note.focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    assert.equal(await page.locator('#phrase-position').innerText(), '2 / 8');
    await page.keyboard.up('Enter');
    await page.locator('#hear-target').click();
    assert.equal(await page.locator('#sound-status').innerText(), '');
    await page.locator('#sound-panic').click();

    await set({low:58,high:90,source:'blues'});
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({path:'test-results/saxophone-dark.png'});
    await page.setViewportSize({width:390,height:760});
    await page.locator('#theme-toggle').click();
    await page.evaluate(() => window.scrollTo(0,0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),390);
    assert.ok(await page.locator('#staff-panel').isVisible());
    assert.ok(await page.locator('#keyboard-panel').isVisible());
    await page.screenshot({path:'test-results/saxophone-light-narrow.png'});
    assert.deepEqual(errors, []);
  } finally {await context.close();}
};
