const assert = require('node:assert/strict');

const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <work><work-title>Alto study</work-title></work>
  <part-list><score-part id="P1"><part-name>Alto Saxophone</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-5</diatonic><chromatic>-9</chromatic></transpose></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>half</type><tie type="start"/></note>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><tie type="stop"/></note>
    <note><rest/><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`;

module.exports = async function studyChecks(browser, midiPage) {
  const {context,page,errors,send,connect} = await midiPage(browser, {viewport:{width:1440,height:900}});
  try {
    const original = await page.locator('#staff').innerHTML();
    await page.locator('#mode-study').click();
    await page.waitForSelector('[data-score-note]');
    assert.equal(await page.locator('#practice-title').innerText(), 'After Hours');
    assert.equal(await page.locator('.vf-stave').count(), 4);
    assert.equal(await page.locator('#outline-settings').isVisible(), false);
    assert.equal(await page.evaluate(() => window.testMidi.requests), 0);
    await page.locator('#mode-outline').click();
    assert.equal(await page.locator('#staff').innerHTML(), original);
    await page.locator('#mode-study').click();
    await page.selectOption('#study-source','turnaround');
    await page.waitForFunction(() => document.getElementById('practice-title').textContent === 'Turnaround');
    await page.locator('#study-file').setInputFiles({name:'alto.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
    await page.waitForFunction(() => document.getElementById('practice-title').textContent === 'Alto study');
    assert.equal(await page.locator('.vf-stavetie').count(), 1);
    assert.equal(await page.locator('.vf-stave').count(), 1);
    assert.match(await page.locator('#study-source-status').innerText(), /written pitches/);
    await page.selectOption('#midi-offset','-9');
    await connect();
    await page.locator('#study-start').click();
    await page.evaluate(() => {window.currentStudy = document.querySelector('#authored-engraving svg');});
    await send([0x90,51,100]);
    assert.equal(await page.locator('[data-practice=accepted]').count(), 1);
    await send([0x80,51,0]);
    assert.match(await page.locator('#feedback').innerText(), /Hold again C4/);
    assert.equal(await page.evaluate(() => window.currentStudy === document.querySelector('#authored-engraving svg')), true);
    await page.locator('#pause-practice').click();
    await page.selectOption('#study-bars','1');
    assert.equal(await page.locator('#feedback').innerText(),'Paused');

    await page.locator('#study-file').setInputFiles({name:'bad.musicxml',mimeType:'application/xml',buffer:Buffer.from('<broken>')});
    await page.waitForFunction(() => document.getElementById('study-import-status').textContent.includes('not well formed'));
    assert.equal(await page.locator('#practice-title').innerText(), 'Alto study');
    await page.locator('#study-play').click();
    await page.waitForFunction(() => document.getElementById('feedback').textContent === 'Playing study');
    await page.locator('#study-audio-pause').click();
    assert.equal(await page.locator('#feedback').innerText(), 'Playback paused');

    assert.deepEqual(errors, []);
  } finally {await context.close();}
};
