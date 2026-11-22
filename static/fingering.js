import {noteName} from './core.js';

// Roland Aerophone GO (AE-05) physical key metadata (front view + rear left-thumb octave module).
export const AE05_KEYS = Object.freeze({
  'oct-up': {id: 'oct-up', label: '+1', name: 'Octave +1 (left thumb up)', hand: 'thumb', group: 'octave'},
  'oct-down': {id: 'oct-down', label: '-1', name: 'Octave -1 (left thumb down)', hand: 'thumb', group: 'octave'},
  'front-f': {id: 'front-f', label: 'X', name: 'Front F key (X)', hand: 'left', group: 'front'},
  lh1: {id: 'lh1', label: '1', name: 'Left index (1)', hand: 'left', group: 'stack'},
  bis: {id: 'bis', label: 'P', name: 'Bis B♭ key (P)', hand: 'left', group: 'stack'},
  lh2: {id: 'lh2', label: '2', name: 'Left middle (2)', hand: 'left', group: 'stack'},
  lh3: {id: 'lh3', label: '3', name: 'Left ring (3)', hand: 'left', group: 'stack'},
  c2: {id: 'c2', label: 'C2', name: 'Palm key C2 (High E♭)', hand: 'left', group: 'palm'},
  c1: {id: 'c1', label: 'C1', name: 'Palm key C1 (High D)', hand: 'left', group: 'palm'},
  c4: {id: 'c4', label: 'C4', name: 'Palm key C4 (High F)', hand: 'left', group: 'palm'},
  gs: {id: 'gs', label: 'G♯', name: 'Left pinky G♯', hand: 'left', group: 'table'},
  'low-b': {id: 'low-b', label: 'B', name: 'Left pinky Low B', hand: 'left', group: 'table'},
  'low-cs': {id: 'low-cs', label: 'C♯', name: 'Left pinky Low C♯', hand: 'left', group: 'table'},
  'low-bb': {id: 'low-bb', label: 'B♭', name: 'Left pinky Low B♭', hand: 'left', group: 'table'},
  rh1: {id: 'rh1', label: '4', name: 'Right index (4)', hand: 'right', group: 'stack'},
  rh2: {id: 'rh2', label: '5', name: 'Right middle (5)', hand: 'right', group: 'stack'},
  rh3: {id: 'rh3', label: '6', name: 'Right ring (6)', hand: 'right', group: 'stack'},
  c3: {id: 'c3', label: 'C3', name: 'Side key C3 (High E)', hand: 'right', group: 'side'},
  tc: {id: 'tc', label: 'Tc', name: 'Side key Tc (Side C)', hand: 'right', group: 'side'},
  ta: {id: 'ta', label: 'Ta', name: 'Side key Ta (Side B♭)', hand: 'right', group: 'side'},
  c5: {id: 'c5', label: 'C5', name: 'High F♯ key (C5)', hand: 'right', group: 'aux'},
  tf: {id: 'tf', label: 'Tf', name: 'Alternate F♯ key (Tf)', hand: 'right', group: 'aux'},
  'low-eb': {id: 'low-eb', label: 'E♭', name: 'Right pinky E♭', hand: 'right', group: 'pinky'},
  'low-c': {id: 'low-c', label: 'C', name: 'Right pinky Low C', hand: 'right', group: 'pinky'},
});

const LOWER_STACK = ['lh1', 'lh2', 'lh3', 'rh1', 'rh2', 'rh3'];

const BASE_OCTAVE_VARIANTS = {
  0: [{name: 'Middle C', keys: ['lh2']} , {name: 'Side C', keys: ['lh1', 'tc']}],
  1: [{name: 'Open', keys: []}],
  2: [{name: 'Standard', keys: [...LOWER_STACK]}],
  3: [{name: 'Standard', keys: [...LOWER_STACK, 'low-eb']}],
  4: [{name: 'Standard', keys: ['lh1', 'lh2', 'lh3', 'rh1', 'rh2']}],
  5: [{name: 'Standard', keys: ['lh1', 'lh2', 'lh3', 'rh1']}],
  6: [{name: 'Standard', keys: ['lh1', 'lh2', 'lh3', 'rh2']}, {name: 'Alt F♯ (Tf)', keys: ['lh1', 'lh2', 'lh3', 'rh1', 'tf']}],
  7: [{name: 'Standard', keys: ['lh1', 'lh2', 'lh3']}],
  8: [{name: 'Standard', keys: ['lh1', 'lh2', 'lh3', 'gs']}],
  9: [{name: 'Standard', keys: ['lh1', 'lh2']}],
  10: [{name: 'Side B♭', keys: ['lh1', 'lh2', 'ta']}, {name: 'Bis', keys: ['lh1', 'bis']}, {name: '1 + 4', keys: ['lh1', 'rh1']}],
  11: [{name: 'Standard', keys: ['lh1']}],
};

// Complete AE-05 Sax fingering table across extended low (B♭2–A3, 46–57) and standard sax (B♭3–F♯6, 58–90).
const FINGERING_TABLE = new Map([
  // Extended lower register with thumb -1 octave key (MIDI 46–57)
  [46, [{name: 'Low B♭ (-1)', keys: ['oct-down', ...LOWER_STACK, 'low-c', 'low-bb']}]],
  [47, [{name: 'Low B (-1)', keys: ['oct-down', ...LOWER_STACK, 'low-c', 'low-b']}]],
  [48, [{name: 'Low C (-1)', keys: ['oct-down', ...LOWER_STACK, 'low-c']}]],
  [49, [{name: 'Low C♯ (-1)', keys: ['oct-down', ...LOWER_STACK, 'low-c', 'low-cs']}]],
  [50, [{name: 'Standard (-1)', keys: ['oct-down', ...LOWER_STACK]}]],
  [51, [{name: 'Standard (-1)', keys: ['oct-down', ...LOWER_STACK, 'low-eb']}]],
  [52, [{name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3', 'rh1', 'rh2']}]],
  [53, [{name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3', 'rh1']}]],
  [54, [
    {name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3', 'rh2']},
    {name: 'Alt F♯ (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3', 'rh1', 'tf']},
  ]],
  [55, [{name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3']}]],
  [56, [{name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2', 'lh3', 'gs']}]],
  [57, [{name: 'Standard (-1)', keys: ['oct-down', 'lh1', 'lh2']}]],

  // Low bell register (MIDI 58–61)
  [58, [{name: 'Low B♭', keys: [...LOWER_STACK, 'low-c', 'low-bb']}]],
  [59, [{name: 'Low B', keys: [...LOWER_STACK, 'low-c', 'low-b']}]],
  [60, [{name: 'Low C', keys: [...LOWER_STACK, 'low-c']}]],
  [61, [{name: 'Low C♯', keys: [...LOWER_STACK, 'low-c', 'low-cs']}]],

  // Middle register D4–C♯5 (MIDI 62–73, no octave key)
  ...Array.from({length: 12}, (_, offset) => {
    const midi = 62 + offset;
    const pc = midi % 12;
    return [midi, BASE_OCTAVE_VARIANTS[pc]];
  }),

  // Upper register D5–C♯6 (MIDI 74–85, +1 octave key)
  ...Array.from({length: 12}, (_, offset) => {
    const midi = 74 + offset;
    const pc = midi % 12;
    return [midi, BASE_OCTAVE_VARIANTS[pc].map(variant => ({
      name: variant.name,
      keys: ['oct-up', ...variant.keys],
    }))];
  }),

  // Palm / High register D6–F♯6 (MIDI 86–90, +1 octave key)
  [86, [{name: 'Palm D', keys: ['oct-up', 'c1']}]],
  [87, [{name: 'Palm E♭', keys: ['oct-up', 'c1', 'c2']}]],
  [88, [
    {name: 'Palm E', keys: ['oct-up', 'c1', 'c2', 'c3']},
    {name: 'Front E', keys: ['oct-up', 'front-f', 'lh2', 'lh3']},
  ]],
  [89, [
    {name: 'Palm F', keys: ['oct-up', 'c1', 'c2', 'c3', 'c4']},
    {name: 'Front F', keys: ['oct-up', 'front-f', 'lh2']},
  ]],
  [90, [
    {name: 'High F♯ (C5)', keys: ['oct-up', 'c1', 'c2', 'c3', 'c4', 'c5']},
    {name: 'Front F♯', keys: ['oct-up', 'front-f', 'lh2', 'ta']},
  ]],
]);

export function aerophoneGoFingering(midi, variantIndex = 0) {
  if (!Number.isInteger(midi) || !FINGERING_TABLE.has(midi)) {
    return {
      midi,
      supported: false,
      keys: [],
      variants: [],
      variantIndex: 0,
      variantName: '',
    };
  }
  const variants = FINGERING_TABLE.get(midi);
  const clamped = Math.max(0, Math.min(variants.length - 1, Number(variantIndex) || 0));
  const chosen = variants[clamped];
  return {
    midi,
    supported: true,
    keys: [...chosen.keys],
    variants: variants.map(variant => ({name: variant.name, keys: [...variant.keys]})),
    variantIndex: clamped,
    variantName: chosen.name,
  };
}

export function compareAerophoneFingering(targetMidi, playedMidi, {targetVariant = 0, playedVariant = 0} = {}) {
  const target = aerophoneGoFingering(targetMidi, targetVariant);
  if (!target.supported || !Number.isInteger(playedMidi)) {
    return {target, played: null, comparing: false, matched: [], needed: [], extra: []};
  }
  const played = aerophoneGoFingering(playedMidi, playedVariant);
  if (!played.supported) {
    return {target, played, comparing: false, matched: [], needed: [], extra: []};
  }
  const targetSet = new Set(target.keys);
  const playedSet = new Set(played.keys);
  return {
    target,
    played,
    comparing: true,
    matched: target.keys.filter(key => playedSet.has(key)),
    needed: target.keys.filter(key => !playedSet.has(key)),
    extra: played.keys.filter(key => !targetSet.has(key)),
  };
}

export function formatFingeringKeys(keys) {
  if (!keys.length) return 'Open (all keys released)';
  return keys.map(id => AE05_KEYS[id]?.label ?? id).join(' · ');
}

function svgEl(tag, attrs = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text) node.textContent = text;
  return node;
}

const KEY_SHAPES = [
  // Rear left-thumb octave module (docked top-left)
  {id: 'oct-up', kind: 'rect', x: 10, y: 82, width: 28, height: 22, rx: 7, lx: 24, ly: 93, cls: 'ae-key ae-key-oct'},
  {id: 'oct-down', kind: 'rect', x: 10, y: 126, width: 28, height: 22, rx: 7, lx: 24, ly: 137, cls: 'ae-key ae-key-oct'},

  // Center front column (LH top -> RH bottom)
  {id: 'front-f', kind: 'rect', x: 96, y: 63, width: 24, height: 15, rx: 7.5, lx: 108, ly: 70.5, cls: 'ae-key ae-key-front'},
  {id: 'lh1', kind: 'circle', cx: 108, cy: 95, r: 11.5, lx: 108, ly: 95, cls: 'ae-key ae-key-main'},
  {id: 'bis', kind: 'circle', cx: 108, cy: 116, r: 6.5, lx: 108, ly: 116, cls: 'ae-key ae-key-bis'},
  {id: 'lh2', kind: 'circle', cx: 108, cy: 137, r: 11.5, lx: 108, ly: 137, cls: 'ae-key ae-key-main'},
  {id: 'lh3', kind: 'circle', cx: 108, cy: 166, r: 11.5, lx: 108, ly: 166, cls: 'ae-key ae-key-main'},

  // Left-hand palm keys (upper-right on front view)
  {id: 'c2', kind: 'rect', x: 140, y: 78, width: 22, height: 15, rx: 6, lx: 151, ly: 85.5, cls: 'ae-key ae-key-palm'},
  {id: 'c1', kind: 'rect', x: 146, y: 98, width: 22, height: 15, rx: 6, lx: 157, ly: 105.5, cls: 'ae-key ae-key-palm'},
  {id: 'c4', kind: 'rect', x: 138, y: 118, width: 22, height: 15, rx: 6, lx: 149, ly: 125.5, cls: 'ae-key ae-key-palm'},

  // Left-hand pinky table (mid-right)
  {id: 'gs', kind: 'rect', x: 136, y: 154, width: 32, height: 13, rx: 5, lx: 152, ly: 160.5, cls: 'ae-key ae-key-table'},
  {id: 'low-b', kind: 'rect', x: 134, y: 171, width: 17, height: 20, rx: 4, lx: 142.5, ly: 181, cls: 'ae-key ae-key-table'},
  {id: 'low-cs', kind: 'rect', x: 153, y: 171, width: 17, height: 20, rx: 4, lx: 161.5, ly: 181, cls: 'ae-key ae-key-table'},
  {id: 'low-bb', kind: 'rect', x: 136, y: 195, width: 32, height: 13, rx: 5, lx: 152, ly: 201.5, cls: 'ae-key ae-key-table'},

  // Right-hand side keys (mid-left vertical stack)
  {id: 'c3', kind: 'rect', x: 52, y: 160, width: 21, height: 15, rx: 6, lx: 62.5, ly: 167.5, cls: 'ae-key ae-key-side'},
  {id: 'tc', kind: 'rect', x: 52, y: 180, width: 21, height: 15, rx: 6, lx: 62.5, ly: 187.5, cls: 'ae-key ae-key-side'},
  {id: 'ta', kind: 'rect', x: 52, y: 200, width: 21, height: 15, rx: 6, lx: 62.5, ly: 207.5, cls: 'ae-key ae-key-side'},

  // Right-hand center stack
  {id: 'rh1', kind: 'circle', cx: 108, cy: 226, r: 11.5, lx: 108, ly: 226, cls: 'ae-key ae-key-main'},
  {id: 'rh2', kind: 'circle', cx: 108, cy: 256, r: 11.5, lx: 108, ly: 256, cls: 'ae-key ae-key-main'},
  {id: 'rh3', kind: 'circle', cx: 108, cy: 286, r: 11.5, lx: 108, ly: 286, cls: 'ae-key ae-key-main'},

  // Right-hand F# auxiliary keys
  {id: 'c5', kind: 'rect', x: 64, y: 233, width: 20, height: 15, rx: 5.5, lx: 74, ly: 240.5, cls: 'ae-key ae-key-aux'},
  {id: 'tf', kind: 'rect', x: 64, y: 255, width: 20, height: 15, rx: 5.5, lx: 74, ly: 262.5, cls: 'ae-key ae-key-aux'},

  // Right-hand pinky keys (bottom-left)
  {id: 'low-eb', kind: 'rect', x: 60, y: 306, width: 30, height: 15, rx: 6, lx: 75, ly: 313.5, cls: 'ae-key ae-key-pinky'},
  {id: 'low-c', kind: 'rect', x: 60, y: 326, width: 30, height: 15, rx: 6, lx: 75, ly: 333.5, cls: 'ae-key ae-key-pinky'},
];

export class AerophoneFingeringChart {
  constructor({svgContainer, noteLabel, keysLabel, variantBar}) {
    this.svgContainer = svgContainer;
    this.noteLabel = noteLabel;
    this.keysLabel = keysLabel;
    this.variantBar = variantBar;
    this.keyNodes = new Map();
    this.keyStates = new Map();
    this.variantByNote = new Map();
    this.currentNote = null;
    this.showName = true;
    this.labelOverride = null;
    this.playedMidi = null;
    this.mirrored = false;
    this.svg = null;
    this.scene = null;
    this.unflipTexts = [];
    this.lastRenderedKey = '';
    this.mountSvg();
  }

  mountSvg() {
    if (!this.svgContainer) return;
    const svg = svgEl('svg', {
      class: 'ae05-svg',
      viewBox: '0 0 186 362',
      role: 'img',
      'aria-label': 'Roland Aerophone GO AE-05 fingering diagram',
    });
    const scene = svgEl('g', {class: 'ae-scene'});
    this.unflipTexts = [];

    const octLabel = svgEl('text', {class: 'ae-region-label', x: 24, y: 69, 'text-anchor': 'middle'}, 'OCTAVE');
    const lhLabel = svgEl('text', {class: 'ae-region-label', x: 54, y: 74, 'text-anchor': 'start'}, 'LH');
    const rhLabel = svgEl('text', {class: 'ae-region-label', x: 158, y: 242, 'text-anchor': 'end'}, 'RH');
    this.unflipTexts.push(
      {node: octLabel, x: 24, baseAnchor: 'middle', mirroredAnchor: 'middle'},
      {node: lhLabel, x: 54, baseAnchor: 'start', mirroredAnchor: 'end'},
      {node: rhLabel, x: 158, baseAnchor: 'end', mirroredAnchor: 'start'},
    );

    // Subtle chassis & mouthpiece silhouette
    scene.append(
      // Rear octave dock enclosure
      svgEl('rect', {class: 'ae-octave-dock', x: 4, y: 74, width: 40, height: 82, rx: 14}),
      svgEl('line', {class: 'ae-octave-link', x1: 44, y1: 115, x2: 78, y2: 115}),
      octLabel,
      svgEl('circle', {class: 'ae-thumb-rest', cx: 24, cy: 115, r: 5}),

      // Mouthpiece & neck silhouette
      svgEl('path', {class: 'ae-mouthpiece', d: 'M99 10 L117 10 L119 42 L97 42 Z'}),
      svgEl('rect', {class: 'ae-reed', x: 102, y: 14, width: 12, height: 16, rx: 4}),
      svgEl('rect', {class: 'ae-collar', x: 92, y: 42, width: 32, height: 9, rx: 4.5}),

      // Main Aerophone GO tapered body
      svgEl('path', {
        class: 'ae-body',
        d: 'M78 51 L138 51 C166 51 178 72 178 106 L178 214 C178 242 162 282 160 326 L166 356 C167 363 161 368 153 368 L63 368 C55 368 49 363 50 356 L56 326 C54 282 44 240 44 214 L44 106 C44 72 56 51 78 51 Z',
      }),

      // Subtle ergonomic hand divider & hand labels
      svgEl('line', {class: 'ae-hand-divider', x1: 60, y1: 196, x2: 164, y2: 196}),
      lhLabel,
      rhLabel,
    );

    for (const shape of KEY_SHAPES) {
      const meta = AE05_KEYS[shape.id];
      const g = svgEl('g', {
        class: shape.cls,
        'data-ae-key': shape.id,
      });
      const title = svgEl('title', {}, meta.name);
      g.append(title);
      if (shape.kind === 'circle') {
        g.append(svgEl('circle', {class: 'ae-key-cap', cx: shape.cx, cy: shape.cy, r: shape.r}));
      } else {
        g.append(svgEl('rect', {class: 'ae-key-cap', x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx}));
      }
      const keyLabel = svgEl('text', {
        class: 'ae-key-label',
        x: shape.lx,
        y: shape.ly,
        'dominant-baseline': 'central',
        'text-anchor': 'middle',
      }, meta.label);
      this.unflipTexts.push({node: keyLabel, x: shape.lx, baseAnchor: 'middle', mirroredAnchor: 'middle'});
      g.append(keyLabel);
      scene.append(g);
      this.keyNodes.set(shape.id, g);
    }

    svg.append(scene);
    this.svg = svg;
    this.scene = scene;
    this.setMirrored(this.mirrored);
    this.svgContainer.replaceChildren(svg);
  }

  setMirrored(mirrored) {
    this.mirrored = Boolean(mirrored);
    if (!this.svg || !this.scene) return;
    this.svg.dataset.mirrored = String(this.mirrored);
    if (this.mirrored) {
      this.scene.setAttribute('transform', 'translate(186 0) scale(-1 1)');
      for (const {node, x, mirroredAnchor} of this.unflipTexts) {
        node.setAttribute('transform', `translate(${x * 2} 0) scale(-1 1)`);
        node.setAttribute('text-anchor', mirroredAnchor);
      }
    } else {
      this.scene.removeAttribute('transform');
      for (const {node, baseAnchor} of this.unflipTexts) {
        node.removeAttribute('transform');
        node.setAttribute('text-anchor', baseAnchor);
      }
    }
  }

  setNote(note, {showName = true, label = null, playedMidi = null} = {}) {
    this.currentNote = note || null;
    this.showName = Boolean(showName);
    this.labelOverride = label || null;
    this.playedMidi = Number.isInteger(playedMidi) ? playedMidi : null;
    const midi = note?.midi ?? null;
    const variantIndex = midi === null ? 0 : (this.variantByNote.get(midi) ?? 0);
    const playedVariant = this.playedMidi === null ? 0 : (this.playedMidi === midi ? variantIndex : (this.variantByNote.get(this.playedMidi) ?? 0));
    const renderKey = `${midi ?? 'none'}:${variantIndex}:${this.playedMidi ?? 'idle'}:${playedVariant}:${this.showName ? '1' : '0'}:${this.labelOverride ?? ''}`;
    if (renderKey === this.lastRenderedKey) return;
    this.lastRenderedKey = renderKey;

    if (midi === null) {
      this.applyKeyStates(new Map());
      if (this.svg) this.svg.dataset.comparing = 'false';
      if (this.noteLabel) this.noteLabel.textContent = '—';
      if (this.keysLabel) this.keysLabel.textContent = 'Play or select a target note';
      this.renderVariants(null);
      return;
    }

    const comparison = compareAerophoneFingering(midi, this.playedMidi, {targetVariant: variantIndex, playedVariant});
    const info = comparison.target;
    if (!info.supported) {
      this.applyKeyStates(new Map());
      if (this.svg) this.svg.dataset.comparing = 'false';
      if (this.noteLabel) this.noteLabel.textContent = this.labelOverride ?? noteName(note);
      if (this.keysLabel) this.keysLabel.textContent = 'Supported chart: B♭2–F♯6';
      this.renderVariants(null);
      return;
    }

    const nextStates = new Map();
    if (comparison.comparing) {
      for (const id of comparison.matched) nextStates.set(id, 'match');
      for (const id of comparison.needed) nextStates.set(id, 'needed');
      for (const id of comparison.extra) nextStates.set(id, 'extra');
      if (this.svg) this.svg.dataset.comparing = 'true';
      if (this.keysLabel) {
        if (!comparison.needed.length && !comparison.extra.length) {
          this.keysLabel.textContent = '✓ Matches target fingering';
        } else {
          this.keysLabel.textContent = [
            comparison.needed.length ? `+ ${formatFingeringKeys(comparison.needed)}` : '',
            comparison.extra.length ? `× ${formatFingeringKeys(comparison.extra)}` : '',
          ].filter(Boolean).join(' · ');
        }
      }
    } else {
      for (const id of info.keys) nextStates.set(id, 'active');
      if (this.svg) this.svg.dataset.comparing = 'false';
      if (this.keysLabel) this.keysLabel.textContent = formatFingeringKeys(info.keys);
    }
    this.applyKeyStates(nextStates);
    if (this.noteLabel) this.noteLabel.textContent = this.labelOverride ?? noteName(note);
    this.renderVariants(info);
  }

  applyKeyStates(nextStates) {
    const classFor = state => {
      if (state === 'active') return ['is-active'];
      if (state === 'match') return ['is-active', 'is-match'];
      if (state === 'needed') return ['is-active', 'is-needed'];
      if (state === 'extra') return ['is-extra'];
      return [];
    };
    const affected = new Set([...this.keyStates.keys(), ...nextStates.keys()]);
    for (const id of affected) {
      const prev = this.keyStates.get(id) ?? null;
      const next = nextStates.get(id) ?? null;
      if (prev === next) continue;
      const node = this.keyNodes.get(id);
      if (!node) continue;
      node.classList.remove('is-active', 'is-match', 'is-needed', 'is-extra');
      const classes = classFor(next);
      if (classes.length) node.classList.add(...classes);
    }
    this.keyStates = nextStates;
  }

  renderVariants(info) {
    if (!this.variantBar) return;
    if (!info || info.variants.length <= 1) {
      this.variantBar.hidden = true;
      this.variantBar.replaceChildren();
      return;
    }
    this.variantBar.hidden = false;
    this.variantBar.replaceChildren(...info.variants.map((variant, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'variant-pill quiet';
      button.textContent = variant.name;
      button.setAttribute('aria-pressed', String(index === info.variantIndex));
      button.dataset.variantIndex = String(index);
      button.addEventListener('click', () => {
        this.variantByNote.set(info.midi, index);
        this.lastRenderedKey = '';
        this.setNote(this.currentNote, {showName: this.showName, label: this.labelOverride, playedMidi: this.playedMidi});
      });
      return button;
    }));
  }
}
