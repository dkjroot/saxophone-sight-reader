const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const url = process.env.APP_URL || 'http://127.0.0.1:8766';

async function midiPage(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const input = {id:'ae05', name:'Synthetic Aerophone', state:'connected', connection:'closed',
      async open() {
        if (this.failOpen) throw new DOMException('Busy', 'InvalidStateError');
        this.connection = 'open'; access.onstatechange?.(); return this;
      },
      async close() {this.connection = 'closed'; access.onstatechange?.(); return this;},
    };
    const access = {inputs:new Map([[input.id,input]]), onstatechange:null};
    window.testMidi = {
      requests:0, input,
      send(data) { if (input.connection === 'open') input.onmidimessage?.({data:Uint8Array.from(data)}); },
      state(value) { input.state = value; access.onstatechange?.(); },
    };
    Object.defineProperty(navigator, 'requestMIDIAccess', {value:async () => {
      window.testMidi.requests++;
      return access;
    }});
  });
  await page.goto(url);
  await page.waitForSelector('.note');
  return {context, page, errors,
    send:data => page.evaluate(data => window.testMidi.send(data), data),
    set:values => page.evaluate(values => {
      for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value;
      document.getElementById(Object.keys(values).at(-1)).dispatchEvent(new Event('change'));
    }, values),
    connect:async () => {
      await page.locator('#connect').click();
      await page.waitForFunction(() => document.getElementById('midi-status').textContent.startsWith('Connected'));
    },
  };
}

async function connectionChecks(browser) {
  for (const mode of ['unsupported','denied']) {
    const context = await browser.newContext();
    await context.addInitScript(mode => Object.defineProperty(navigator, 'requestMIDIAccess', {
      value:mode === 'unsupported' ? undefined : async () => {throw new DOMException('Denied','NotAllowedError');},
    }), mode);
    const page = await context.newPage();
    await page.goto(url);
    await page.locator('#connect').click();
    assert.match(await page.locator('#midi-status').innerText(), new RegExp(mode === 'unsupported' ? 'unavailable' : 'denied'));
    const pitch = await page.locator('.note').first().getAttribute('data-midi');
    await page.locator(`.key[data-pitch="${pitch}"]`).press('Enter');
    assert.equal(await page.locator('#phrase-position').innerText(), '2 / 8');
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
  try {
    await require('./ui_flow.browser.cjs')(browser, midiPage);
    await require('./score_practice.browser.cjs')(browser, midiPage);
    await require('./mvp.browser.cjs')(browser, midiPage);
    await connectionChecks(browser);
    console.log('Browser checks passed: wind MIDI, transposition, articulation, progression, themes and layout, history, file workflows, studies, audio and device errors.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
