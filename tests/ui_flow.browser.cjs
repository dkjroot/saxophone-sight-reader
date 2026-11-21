const assert = require('node:assert/strict');

module.exports = async function pitchChecks(browser, midiPage) {
  const {context,page,errors,send,set,connect} = await midiPage(browser, {viewport:{width:1440,height:900}});
  const noteOn = pitch => send([0x90,pitch,100]), noteOff = pitch => send([0x80,pitch,0]);
  const position = () => page.locator('#phrase-position').innerText();
  const current = () => page.locator('.note').first().getAttribute('data-midi');
  const pad = pitch => page.locator(`.key[data-pitch="${pitch}"]`);
  try {
    assert.equal(await page.locator('h1').innerText(), 'Saxophone Sight Reader');
    assert.equal(await page.locator('.clef').count(), 1);
    assert.equal(await page.locator('.brace').count(), 0);
    assert.equal(await pad(58).count(), 1);
    assert.equal(await pad(90).count(), 1);
    assert.equal(await page.locator('.key').count(), 33);
    assert.equal(await page.evaluate(() => window.testMidi.requests), 0);
    await set({source:'blues',low:60,high:72});
    assert.equal(await current(), '60');
    assert.equal(await page.locator('.note').nth(1).getAttribute('data-midi'), '63');
    assert.equal(await page.locator('.accidental').first().textContent(), '♭');
    assert.equal(await page.locator('#midi-offset').inputValue(), '3');
    assert.equal(await page.locator('#close-fingering').count(), 0);
    assert.equal(await page.locator('#show-targets').isChecked(), false);
    assert.equal(await page.locator('#show-fingering').isChecked(), false);
    assert.equal(await page.locator('#fingering-panel').isVisible(), false);
    await page.locator('#show-targets').check();
    const marker = await pad(60).evaluate(node => getComputedStyle(node,'::after').content);
    assert.match(marker, /◆/);

    await page.locator('#show-fingering').check();
    assert.equal(await page.locator('#fingering-panel').isVisible(), true);
    assert.equal(await page.locator('#fingering-note-name').innerText(), 'Target note');
    assert.equal(await page.locator('#fingering-mirrored').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#fingering-straight').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.ae05-svg').getAttribute('data-mirrored'), 'true');
    const keyX = id => page.locator(`[data-ae-key="${id}"]`).evaluate(node => node.getBoundingClientRect().left);
    assert.ok(await keyX('c1') < await keyX('ta'), 'mirrored view places left-hand palm key on screen left');
    await page.locator('#fingering-straight').click();
    assert.equal(await page.locator('#fingering-mirrored').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#fingering-straight').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.ae05-svg').getAttribute('data-mirrored'), 'false');
    assert.ok(await keyX('c1') > await keyX('ta'), 'straight view places left-hand palm key on screen right');
    assert.equal(await page.locator('[data-ae-key="low-c"].is-active').count(), 1);
    await page.locator('#quick-reveal').click();
    assert.equal(await page.locator('#reveal').isChecked(), true);
    assert.equal(await page.locator('#fingering-note-name').innerText(), 'C4');
    await page.locator('#quick-reveal').click();
    assert.equal(await page.locator('#reveal').isChecked(), false);

    const staffY = await page.locator('#keyboard-panel').evaluate(node => node.getBoundingClientRect().top + window.scrollY);
    await page.locator('#tab-instrument').click();
    await page.selectOption('#midi-offset','-9');
    await connect();
    await noteOn(50);
    assert.match(await page.locator('#feedback').innerText(), /higher/);
    assert.equal(await page.locator('.note-direction').first().textContent(), '↑');
    assert.equal(await page.locator('#played-mark').textContent(), '×');
    await send([0xb0,2,126]);
    assert.equal(await position(), '1 / 8');
    await noteOn(51);
    await noteOff(50);
    assert.equal(await position(), '2 / 8');
    assert.equal(await pad(60).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#played-mark').textContent(), '✓');
    assert.equal(await page.locator('[data-ae-key="low-eb"].is-active').count(), 1);
    await noteOn(54);
    await noteOff(51);
    assert.equal(await position(), '3 / 8', 'note-on before previous release advances through a slur');
    assert.equal(await page.locator('#keyboard [aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('#keyboard-panel').evaluate(node => node.getBoundingClientRect().top + window.scrollY), staffY);
    await noteOff(54);

    await page.locator('#tab-practice').click();
    await page.selectOption('#preview','7');
    await page.selectOption('#scroll-mode','page');
    assert.equal(await position(), '3 / 8');
    assert.ok(await page.locator('.note[data-step="2"]').count());

    await page.locator('#tab-instrument').click();
    await page.locator('#calibrate').click();
    assert.equal(await page.locator('#fingering-note-name').innerText(), 'Calibrate · G4');
    assert.equal(await page.locator('[data-ae-key="lh1"].is-active').count(), 1);
    assert.equal(await page.locator('[data-ae-key="lh2"].is-active').count(), 1);
    assert.equal(await page.locator('[data-ae-key="lh3"].is-active').count(), 1);
    await noteOn(55);
    assert.equal(await page.locator('#midi-offset').inputValue(), '-12');
    assert.match(await page.locator('#mapping-status').innerText(), /MIDI 55/);
    await noteOff(55);
    await page.locator('#learn-low').click();
    await noteOn(47);
    assert.equal(await page.locator('#low').inputValue(), '59');
    assert.match(await page.locator('#range-status').innerText(), /B3/);
    await noteOff(47);

    await set({source:'random',length:2,low:60,high:60});
    await page.locator('#tab-practice').click();
    await page.locator('#end-stop').check();
    await page.locator('#tab-progress').click();
    await page.locator('#save-history').check();
    await noteOn(48);
    assert.equal(await position(), '2 / 2');
    await noteOn(48);
    assert.equal(await page.locator('#feedback').innerText(), 'Play again');
    await noteOff(48);
    await noteOn(48);
    assert.equal(await page.locator('#feedback').innerText(), '✓ Passage complete');
    await noteOff(48);
    assert.equal(await page.locator('#stats-count').innerText(), '2');
    await page.locator('#restart-pitch').click();
    assert.equal(await current(), '60');

    await page.locator('#tab-practice').click();
    await page.selectOption('#progression','release');
    await noteOn(48);
    assert.equal(await page.locator('#feedback').innerText(), '✓ Release the note');
    assert.equal(await position(), '1 / 2');
    await send([0x90,48,0]);
    assert.equal(await position(), '2 / 2');
    await page.evaluate(() => window.testMidi.state('disconnected'));
    await page.waitForFunction(() => document.getElementById('inputs').disabled);
    assert.equal(await page.locator('#keyboard [aria-pressed=true]').count(), 0);
    await page.evaluate(() => {window.testMidi.input.failOpen = true; window.testMidi.state('connected');});
    await page.waitForFunction(() => document.getElementById('midi-status').textContent.includes('could not open'));
    await page.evaluate(() => {window.testMidi.input.failOpen = false;});
    await connect();

    await page.selectOption('#progression','flow');
    await page.locator('#end-new').check();
    const latency = await page.evaluate(async () => {
      const start = performance.now();
      for (let i = 0; i < 45; i++) { window.testMidi.send([0x90, 48, 90]); window.testMidi.send([0x80, 48, 0]); }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - start;
    });
    assert.ok(latency < 500, `Expected rapid MIDI batch + paint under 500ms, got ${latency.toFixed(2)}ms`);
    await page.waitForFunction(() => +document.getElementById('phrase-position').textContent >= 33);
    for (let i=0; i<13 && +(await position()) < 46; i++) {await noteOn(48); await noteOff(48);}
    assert.equal(await page.locator('#count').innerText(),'45');

    // Verify Studio Dock keyboard tab switching & stage quick pill sync.
    await page.locator('#tab-practice').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-instrument').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panel-instrument').isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#tab-progress').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#tab-practice').getAttribute('aria-selected'), 'true');
    await page.locator('#quick-metronome').click();
    assert.equal(await page.locator('#metronome').isChecked(), true);
    await page.locator('#quick-panic').click();
    assert.equal(await page.locator('#metronome').isChecked(), false);

    // Verify B♭4 Side B♭ -> Bis alternate fingering without shifting keyboard-panel Y.
    await set({source:'random', material:'flats', length:2, low:70, high:70});
    assert.equal(await page.locator('[data-ae-key="lh1"].is-active').count(), 1);
    assert.equal(await page.locator('[data-ae-key="lh2"].is-active').count(), 1);
    assert.equal(await page.locator('[data-ae-key="ta"].is-active').count(), 1);
    await page.locator('.variant-pill', {hasText: 'Bis'}).click();
    assert.equal(await page.locator('[data-ae-key="bis"].is-active').count(), 1);
    assert.equal(await page.locator('#keyboard-panel').evaluate(node => node.getBoundingClientRect().top + window.scrollY), staffY);
    await set({low:60, high:60, material:'white'});

    await page.locator('#theme-toggle').click();
    await page.reload();
    await page.waitForSelector('.note');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#midi-offset').inputValue(), '-12');
    assert.equal(await page.locator('#low').inputValue(), '60');
    assert.equal(await page.locator('#show-targets').isChecked(), true);
    assert.equal(await page.locator('#show-fingering').isChecked(), true);
    assert.equal(await page.locator('#fingering-panel').isVisible(), true);
    assert.equal(await page.locator('#fingering-straight').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.ae05-svg').getAttribute('data-mirrored'), 'false');

    const helpEvent = page.waitForEvent('popup');
    await page.locator('.header-help').click();
    const help = await helpEvent;
    assert.match(await help.title(), /Saxophone Sight Reader/);
    assert.equal(await help.locator('script[src="/static/app.js"]').count(), 0);
    await help.locator('#help-close').click();
    assert.deepEqual(errors, []);
  } finally {await context.close();}
};
