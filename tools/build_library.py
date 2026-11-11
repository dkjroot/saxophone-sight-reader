"""Build the written-pitch sax library and its MIDI inspections offline."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import sys

import mido

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from score_import import inspect_midi
from musicxml_import import import_musicxml


def compile_piece(directory, entry, data=None):
    required = ('title', 'composer', 'source_page', 'source_url', 'edition', 'contributor', 'licence', 'licence_url', 'licence_evidence', 'reviewed')
    if any(not entry.get(field) for field in required):
        raise ValueError('Missing library provenance or licence metadata.')
    licences = {
        'Public Domain dedication': 'https://www.mutopiaproject.org/legal.html#publicdomain',
        'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'GPL-3.0-only': 'https://www.gnu.org/licenses/gpl-3.0.html',
    }
    if entry['licence'] not in licences or entry['licence_url'] != licences[entry['licence']]:
        raise ValueError('Library licence requires a separate review before acceptance.')
    if entry['licence'] == 'CC BY-SA 4.0':
        name = entry.get('licence_file', '')
        if not name or Path(name).name != name:
            raise ValueError('Share-alike editions require a local licence text.')
        text = (directory / name).read_text(encoding='utf-8')
        if 'Attribution-ShareAlike 4.0 International' not in text or 'Section 8' not in text:
            raise ValueError('Incomplete share-alike licence text.')
    if Path(entry['midi']).name != entry['midi'] or Path(entry['inspection']).name != entry['inspection']:
        raise ValueError('Library assets must be basenames.')
    if data is None:
        data = (directory / entry['midi']).read_bytes()
    if sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('MIDI checksum does not match the reviewed source.')
    if entry.get('notation_source'):
        if Path(entry['notation_source']).name != entry['notation_source'] or not entry.get('notation_source_url'):
            raise ValueError('Invalid reviewed notation source.')
        if sha256((directory / entry['notation_source']).read_bytes()).hexdigest() != entry.get('notation_source_sha256'):
            raise ValueError('Notation source checksum does not match the reviewed source.')
    score = inspect_midi(data)
    if score['warnings'] != entry.get('reviewed_warnings', []) or score['warning_count'] != len(entry.get('reviewed_warnings', [])):
        raise ValueError('MIDI diagnostics differ from the explicitly reviewed warnings.')
    score['licence'] = entry['licence']
    provenance_fields = required + ('source_title', 'metadata_sha256', 'source_archive_sha256', 'source_archive_member', 'licence_file',
        'written_for', 'source_licence', 'source_credit', 'reading_focus', 'arrangement_sha256', 'reference_sha256')
    score['provenance'] = {field: entry[field] for field in provenance_fields if field in entry}
    return score


def compile_notation(directory, entry):
    compile_piece(directory, entry)  # edition/asset provenance must still validate
    excerpt = entry['notation_excerpt']
    for field in ('xml', 'inspection'):
        if Path(excerpt[field]).name != excerpt[field]:
            raise ValueError('Notation excerpt assets must be basenames.')
    data = (directory / excerpt['xml']).read_bytes()
    if sha256(data).hexdigest() != excerpt['sha256'] or not entry.get('notation_source_sha256'):
        raise ValueError('Notation excerpt checksum does not match the reviewed source.')
    score = import_musicxml(data)
    score['provenance'].update(edition=entry['edition'], contributor=entry['contributor'],
        licence=entry['licence'], source_page=entry['source_page'], excerpt=excerpt['scope'],
        notation_source_sha256=entry['notation_source_sha256'])
    return score


def render_arrangement(arrangement):
    """Each line is a bar, with lengths in 32nd-note units."""
    identifier = arrangement['id']
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', identifier):
        raise ValueError('Invalid arrangement ID.')
    meter = arrangement['meter']
    if meter not in ([4, 4], [3, 4], [2, 4]):
        raise ValueError(f'{identifier}: unsupported meter.')
    title = arrangement['title']
    midi = mido.MidiFile(type=0, ticks_per_beat=480)
    track = midi.add_track('Saxophone')
    track.extend([
        mido.MetaMessage('text', text=title),
        mido.MetaMessage('key_signature', key=arrangement['key']),
        mido.MetaMessage('time_signature', numerator=meter[0], denominator=meter[1]),
        mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(arrangement['tempo'])),
        mido.Message('program_change', program=65),  # General MIDI alto saxophone
    ])
    pitches = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    gap, held = 0, None
    for number, bar in enumerate(arrangement['bars'], 1):
        bar_length = 0
        for token in bar.split():
            match = re.fullmatch(r'(R|[A-G][b#]?[3-6]|-):(\d{1,2})', token)
            if not match:
                raise ValueError(f'{identifier}, bar {number}: invalid token {token}.')
            name, duration = match[1], int(match[2])
            if duration <= 0:
                raise ValueError(f'{identifier}, bar {number}: durations must be positive.')
            bar_length += duration
            ticks = duration * 60
            if name == '-':
                if held is None:
                    raise ValueError(f'{identifier}, bar {number}: tie has no preceding note.')
                gap += ticks
                continue
            if held is not None:
                track.append(mido.Message('note_off', note=held, velocity=0, time=gap))
                held, gap = None, 0
            if name == 'R':
                gap += ticks
                continue
            pitch = 12 * (int(name[-1]) + 1) + pitches[name[0]] + {'':0, '#':1, 'b':-1}[name[1:-1]]
            if not 58 <= pitch <= 90:
                raise ValueError(f'{identifier}, bar {number}: {name} exceeds the written sax range.')
            track.append(mido.Message('note_on', note=pitch, velocity=84, time=gap))
            held, gap = pitch, ticks
        if bar_length != meter[0] * 8:
            raise ValueError(f'{identifier}, bar {number}: duration does not fill the measure.')
    if held is not None:
        track.append(mido.Message('note_off', note=held, velocity=0, time=gap))
        gap = 0
    track.append(mido.MetaMessage('end_of_track', time=gap))
    buffer = BytesIO()
    midi.save(file=buffer)
    return buffer.getvalue()


def compile_arrangement(directory, arrangement):
    data = render_arrangement(arrangement)
    entry = {field: arrangement[field] for field in (
        'id', 'title', 'composer', 'style', 'era', 'edition', 'source_credit',
        'source_page', 'source_url', 'source_licence', 'licence_evidence', 'reviewed', 'reading_focus',
    )}
    if 'reference_sha256' in arrangement:
        if not re.fullmatch(r'[0-9a-f]{64}', arrangement['reference_sha256']):
            raise ValueError(f"{entry['id']}: invalid reference checksum.")
        entry['reference_sha256'] = arrangement['reference_sha256']
    entry.update(
        midi=entry['id']+'.mid', inspection=entry['id']+'.json', sha256=sha256(data).hexdigest(),
        contributor='Saxophone Sight Reader', difficulty='Unrated', written_for='saxophone',
        licence='GPL-3.0-only', licence_url='https://www.gnu.org/licenses/gpl-3.0.html',
        arrangement_sha256=sha256(json.dumps(arrangement, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
    )
    score = compile_piece(directory, entry, data)
    if not score['notes']:
        raise ValueError(f"{entry['id']}: arrangement contains no attacks.")
    return entry, score, data


def write_json(path, value, **options):
    path.write_text(json.dumps(value, ensure_ascii=False, **options)+'\n', encoding='utf-8', newline='\n')


def main():
    directory = ROOT / 'static' / 'library'
    source = json.loads((directory / 'arrangements.json').read_text(encoding='utf-8'))
    compiled = [compile_arrangement(directory, item) for item in source['pieces']]
    entries = [entry for entry, _, _ in compiled]
    if len({entry['id'] for entry in entries}) != len(entries):
        raise ValueError('Library IDs must be unique.')
    for entry, score, data in compiled:
        (directory / entry['midi']).write_bytes(data)
        write_json(directory / entry['inspection'], score, separators=(',', ':'))
        print(f"{entry['id']}: {len(score['notes'])} attacks")
    write_json(directory / 'catalogue.json', {'version':1, 'pieces':entries}, indent=2)


if __name__ == '__main__':
    main()
