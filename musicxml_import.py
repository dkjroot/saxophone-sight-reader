"""Bounded, local MusicXML subset -> authored score; never infer notation from MIDI."""
from fractions import Fraction
from hashlib import sha256
import re
import xml.etree.ElementTree as ET

from score_import import ScoreError, MAX_BYTES

VALUES = {'whole': ('w', Fraction(4)), 'half': ('h', Fraction(2)),
          'quarter': ('q', Fraction(1)), 'eighth': ('8', Fraction(1, 2)),
          '16th': ('16', Fraction(1, 4)), '32nd': ('32', Fraction(1, 8))}
KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']


def need(condition, message):
    if not condition:
        raise ScoreError(message)


def integer(text, low, high, label):
    text = text.strip() if isinstance(text, str) else text
    need(text is not None and re.fullmatch(r'-?\d{1,9}', text) is not None, 'Invalid '+label+'.')
    value = int(text)
    need(low <= value <= high, 'Unsupported '+label+'.')
    return value


def pair(value):
    return [value.numerator, value.denominator]


def import_musicxml(data):
    need(0 < len(data) <= MAX_BYTES, 'Choose an uncompressed MusicXML file no larger than 256 KB.')
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError as error:
        raise ScoreError('MusicXML must use UTF-8 encoding.') from error
    need(not re.search(r'<!\s*(DOCTYPE|ENTITY)', text, re.I) and '\x00' not in text,
         'MusicXML DTD/entity declarations are unsupported; export without a DOCTYPE.')
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ScoreError('The MusicXML document is not well formed.') from error
    elements = list(root.iter())
    need(len(elements) <= 30000, 'MusicXML has too many elements.')
    # Support both namespace-free exports and the MusicXML namespace, never mix tags.
    for element in elements:
        if isinstance(element.tag, str) and element.tag.startswith('{'):
            namespace, tag = element.tag[1:].split('}', 1)
            need(namespace == 'http://www.musicxml.org/ns/musicxml', 'Unsupported XML namespace.')
            element.tag = tag
    need(root.tag == 'score-partwise', 'Use score-partwise MusicXML.')
    parts = root.findall('part')
    need(len(parts) == 1, 'Choose a MusicXML file with one part.')
    measures = parts[0].findall('measure')
    need(1 <= len(measures) <= 256, 'Use one to 256 MusicXML measures.')
    unsupported = {'grace', 'unpitched', 'time-modification', 'tuplet', 'repeat', 'ending',
                   'octave-shift', 'senza-misura', 'multiple-rest', 'cue', 'instrument', 'staff-tuning'}
    found = sorted({e.tag for e in elements} & unsupported)
    need(not found, 'Unsupported MusicXML features: '+', '.join(found)+'. No score was loaded.')
    traversal = {'dacapo', 'dalsegno', 'tocoda', 'fine', 'segno', 'coda', 'forward-repeat', 'time-only'}
    need(not any(traversal & set(sound.attrib) for sound in root.iter('sound')),
         'MusicXML playback traversal is unsupported. No score was loaded.')
    warnings = []
    ignored = sorted({e.tag for e in elements} & {'dynamics', 'wedge', 'articulations', 'slur',
                      'technical', 'ornaments', 'pedal', 'words', 'fermata'})
    if ignored:
        warnings.append('Retained in source XML, not rendered or judged: '+', '.join(ignored)+'.')
    staff_count = 2 if any(
        element.findtext('staves') == '2' for element in parts[0].iter('attributes')
    ) else 1
    if any(element.tag == 'transpose' for element in elements):
        warnings.append('Using written pitches. Set MIDI pitch mapping for your instrument.')
    digest = sha256(data).hexdigest()
    title = root.findtext('work/work-title') or root.findtext('movement-title') or 'Imported MusicXML'
    need(0 < len(title) <= 200, 'Use a MusicXML title of up to 200 characters.')
    result = {'version': 1, 'id': 'xml-'+digest[:16], 'title': title,
              'composer': root.findtext('identification/creator[@type="composer"]') or '',
              'provenance': {'kind': 'musicxml', 'sha256': digest, 'format': 'MusicXML',
                             'source_xml': text, 'warnings': warnings},
              'staves': [{'id': 'upper', 'clef': 'treble'}, {'id': 'lower', 'clef': 'bass'}][:staff_count],
              'voices': [], 'measures': [], 'ties': [], 'tempos': []}
    divisions, meter, key, clefs = None, None, 'C', {staff['id']: staff['clef'] for staff in result['staves']}
    position, pending, voices, total = Fraction(0), {}, {}, 0
    for mi, measure in enumerate(measures):
        cursor, extent, previous = Fraction(0), Fraction(0), None
        events = []
        record = {'id': f'xml-m{mi}', 'events': events, 'source_measure': measure.get('number', str(mi+1))}
        for child in measure:
            if child.tag == 'attributes':
                need(cursor == 0, 'Mid-measure attribute changes are unsupported.')
                if child.find('divisions') is not None:
                    divisions = integer(child.findtext('divisions'), 1, 1000000, 'divisions')
                if child.find('staves') is not None:
                    need(child.findtext('staves') == str(staff_count), 'Use one or two staves throughout the part.')
                for time in child.findall('time'):
                    need(time.get('number') is None and len(time.findall('beats')) == 1, 'Staff-specific/additive meters are unsupported.')
                    meter = [integer(time.findtext('beats'), 1, 32, 'meter numerator'), integer(time.findtext('beat-type'), 1, 32, 'meter denominator')]
                    need(meter[1] in (1, 2, 4, 8, 16, 32), 'Unsupported meter denominator.')
                for signature in child.findall('key'):
                    need(signature.get('number') is None and signature.find('fifths') is not None and signature.find('cancel') is None, 'Unsupported key signature.')
                    key = KEYS[integer(signature.findtext('fifths'), -7, 7, 'key signature')+7]
                for clef in child.findall('clef'):
                    staff = integer(clef.get('number', '1'), 1, staff_count, 'clef staff')
                    name = (clef.findtext('sign'), clef.findtext('line'))
                    need(name in [('G', '2'), ('F', '4')] and clef.find('clef-octave-change') is None, 'Only treble and bass clefs are supported.')
                    clefs['upper' if staff == 1 else 'lower'] = 'treble' if name[0] == 'G' else 'bass'
            elif child.tag in ('backup', 'forward'):
                need(divisions is not None, 'Declare divisions before timed events.')
                length = Fraction(integer(child.findtext('duration'), 1, 100000000, 'cursor duration'), divisions)
                cursor += -length if child.tag == 'backup' else length
                need(cursor >= 0, 'MusicXML backup moves before its measure.')
                extent = max(extent, cursor)
                previous = None
            elif child.tag == 'direction':
                sound = child.find('sound')
                if sound is not None and sound.get('tempo') is not None:
                    need(child.find('offset') is None, 'Offset tempo directions are unsupported.')
                    try:
                        bpm = float(sound.get('tempo'))
                    except ValueError as error:
                        raise ScoreError('Invalid MusicXML tempo.') from error
                    need(1 <= bpm <= 600, 'Invalid MusicXML tempo.')
                    result['tempos'].append({'at': pair(position+cursor), 'bpm': bpm})
            elif child.tag == 'note':
                total += 1
                need(total <= 4096 and divisions is not None and meter is not None, 'Declare divisions/meter before notes; limit is 4,096 notes.')
                voice = child.findtext('voice') or '1'
                need(re.fullmatch(r'[A-Za-z0-9_-]{1,40}', voice) is not None, 'Invalid MusicXML voice.')
                vid = 'xml-v'+voice
                staff = integer(child.findtext('staff') or '1', 1, staff_count, 'note staff')
                sid = 'upper' if staff == 1 else 'lower'
                stem = child.findtext('stem')
                need(stem is None or stem in ('up', 'down'), 'Unsupported stem direction.')
                if vid not in voices:
                    need(len(voices) < 16, 'Use at most sixteen voices.')
                    voices[vid] = {'id': vid, 'staff': sid}
                    if stem:
                        voices[vid]['stem'] = stem
                rest = child.find('rest') is not None
                value = child.findtext('type')
                need(value in VALUES, 'Use explicit whole through 32nd note types; whole-bar rest shorthand is unsupported.')
                dots = len(child.findall('dot'))
                need(dots <= 2, 'Use up to two dots.')
                length = Fraction(integer(child.findtext('duration'), 1, 100000000, 'note duration'), divisions)
                expected = VALUES[value][1]*Fraction(2**(dots+1)-1, 2**dots)
                need(length == expected, 'Written note type/dots and MusicXML duration disagree; tuplets are not yet supported.')
                chord = child.find('chord') is not None
                if chord:
                    need(previous is not None and not rest and previous['kind'] == 'note' and previous['voice'] == vid and previous['staff'] == sid and previous['value'] == VALUES[value][0] and previous['dots'] == dots,
                         'Chord tones must share voice, staff and duration.')
                    event = previous
                else:
                    event = {'id': f'xml-e{total}', 'voice': vid, 'staff': sid, 'kind': 'rest' if rest else 'note', 'at': pair(cursor), 'value': VALUES[value][0], 'dots': dots, 'notes': []}
                    events.append(event); cursor += length; extent = max(extent, cursor); previous = event
                if not rest:
                    pitch = child.find('pitch')
                    need(pitch is not None, 'A pitched note needs its written pitch.')
                    letter = pitch.findtext('step')
                    alter = integer(pitch.findtext('alter') or '0', -2, 2, 'written alteration')
                    octave = integer(pitch.findtext('octave'), -1, 9, 'written octave')
                    need(isinstance(letter, str) and len(letter) == 1 and letter in 'ABCDEFG', 'Invalid written pitch letter.')
                    midi = 12*(octave+1)+{'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[letter]+alter
                    need(0 <= midi <= 127 and len(event['notes']) < 10, 'Unsupported pitch/chord size.')
                    note = {'id': f'xml-n{total}', 'letter': letter, 'accidental': alter, 'octave': octave}
                    accidental = child.find('accidental')
                    if accidental is not None and accidental.get('cautionary') == 'yes':
                        note['courtesy'] = True
                    event['notes'].append(note)
                    identity = (vid, letter, alter, octave)
                    ties = {tie.get('type') for tie in child.findall('tie')+child.findall('notations/tied')}
                    need(ties <= {'start', 'stop'}, 'Unsupported tie type.')
                    if 'stop' in ties:
                        need(identity in pending, 'Tie stop has no matching written start.')
                        old, ending = pending.pop(identity)
                        need(ending == position+Fraction(*event['at']), 'Ties must join adjacent notes.')
                        result['ties'].append({'from': old, 'to': note['id']})
                    if 'start' in ties:
                        need(identity not in pending, 'Overlapping tie starts.')
                        pending[identity] = (note['id'], position+Fraction(*event['at'])+length)
        need(meter is not None and extent > 0, 'A measure needs a meter and timed events.')
        full = Fraction(meter[0]*4, meter[1])
        need(extent <= full, 'Measure events exceed their time signature.')
        need(mi == 0 or extent == full or measure.get('implicit') == 'yes', 'Mark incomplete interior measures implicit.')
        record.update(meter=list(meter), key=key, clefs=dict(clefs), length=pair(extent), pickup=mi == 0 and extent < full)
        record['boundary'] = 'final' if mi == len(measures)-1 else 'single'
        result['measures'].append(record); position += extent
    need(not pending, 'A tie leaves the imported passage; include its full continuation.')
    # Missing lanes/gaps become explicit, provenance-labelled rests, never notes.
    for measure in result['measures']:
        end = Fraction(*measure['length'])
        for vid in voices:
            lane = sorted((e for e in measure['events'] if e['voice'] == vid), key=lambda e: Fraction(*e['at']))
            at = Fraction(0)
            for event in lane+[None]:
                next_at = Fraction(*event['at']) if event else end
                need(next_at >= at, 'Overlapping events in a MusicXML voice.')
                gap = next_at-at
                for _, (value, duration) in VALUES.items():
                    while gap >= duration:
                        total += 1
                        need(total <= 4096, 'Too many imported events.')
                        measure['events'].append({'id': f'xml-gap{total}', 'voice': vid, 'staff': voices[vid]['staff'], 'kind': 'rest', 'at': pair(at), 'value': value, 'notes': [], 'derived_silence': True})
                        gap -= duration; at += duration
                need(gap == 0, 'A voice gap cannot be represented with supported rest values.')
                if event:
                    at = next_at+VALUES[next(name for name, item in VALUES.items() if item[0] == event['value'])][1]*Fraction(2**(event['dots']+1)-1, 2**event['dots'])
    result['voices'] = list(voices.values())
    if not result['tempos'] or result['tempos'][0]['at'] != [0, 1]:
        result['tempos'].insert(0, {'at': [0, 1], 'bpm': 120})
        warnings.append('No opening tempo supplied; using 120 quarter notes/minute for practice.')
    result['provenance']['imported_notes'] = sum(len(e['notes']) for m in result['measures'] for e in m['events'])
    return result
