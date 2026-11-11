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
    assert.equal(await page.locator('#show-targets').isChecked(), false);
    await page.locator('#show-targets').check();
    const marker = await pad(60).evaluate(node => getComputedStyle(node,'::after').content);
    assert.match(marker, /◆/);
    const staffY = await page.locator('#keyboard-panel').evaluate(node => node.getBoundingClientRect().top + window.scrollY);
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
    await noteOn(54);
    await noteOff(51);
    assert.equal(await position(), '3 / 8', 'note-on before previous release advances through a slur');
    assert.equal(await page.locator('#keyboard [aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('#keyboard-panel').evaluate(node => node.getBoundingClientRect().top + window.scrollY), staffY);
    await noteOff(54);
    await page.selectOption('#preview','7');
    await page.selectOption('#scroll-mode','page');
    assert.equal(await position(), '3 / 8');
    assert.ok(await page.locator('.note[data-step="2"]').count());

    await page.locator('#calibrate').click();
    await noteOn(48);
    assert.equal(await page.locator('#midi-offset').inputValue(), '-12');
    assert.match(await page.locator('#mapping-status').innerText(), /MIDI 48/);
    await noteOff(48);
    await page.locator('#learn-low').click();
    await noteOn(47);
    assert.equal(await page.locator('#low').inputValue(), '59');
    assert.match(await page.locator('#range-status').innerText(), /B3/);
    await noteOff(47);

    await set({source:'random',length:2,low:60,high:60});
    await page.locator('#end-stop').check();
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
    await page.evaluate(() => {
      for (let i=0; i<45; i++) {window.testMidi.send([0x90,48,90]); window.testMidi.send([0x80,48,0]);}
    });
    await page.waitForFunction(() => +document.getElementById('phrase-position').textContent >= 33);
    for (let i=0; i<13 && +(await position()) < 46; i++) {await noteOn(48); await noteOff(48);}
    assert.equal(await page.locator('#count').innerText(),'45');

    await page.locator('#theme-toggle').click();
    await page.reload();
    await page.waitForSelector('.note');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#midi-offset').inputValue(), '-12');
    assert.equal(await page.locator('#low').inputValue(), '60');
    assert.equal(await page.locator('#show-targets').isChecked(), true);

    const helpEvent = page.waitForEvent('popup');
    await page.locator('.header-help').click();
    const help = await helpEvent;
    assert.match(await help.title(), /Saxophone Sight Reader/);
    assert.equal(await help.locator('script[src="/static/app.js"]').count(), 0);
    await help.locator('#help-close').click();
    assert.deepEqual(errors, []);
  } finally {await context.close();}
};
