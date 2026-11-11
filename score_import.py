"""Bounded local Standard MIDI File inspection. Original bytes are never rewritten."""
from bisect import bisect_right
from collections import defaultdict, deque
from hashlib import sha256
from io import BytesIO
import struct

import mido

MAX_BYTES = 256_000
MAX_EVENTS = 25_000
MAX_TRACKS = 64


class ScoreError(ValueError):
    pass


def validate_track(data):
    """Reject oversized VLQs and event counts before constructing parser objects."""
    position, count, running, tick, ended = 0, 0, None, 0, False

    def variable():
        nonlocal position
        value = 0
        for _ in range(4):
            if position >= len(data):
                raise ScoreError('Truncated MIDI variable-length value.')
            byte = data[position]
            position += 1
            value = (value << 7) | (byte & 127)
            if byte < 128:
                return value
        raise ScoreError('MIDI variable-length values may use at most four bytes.')

    while position < len(data):
        count += 1
        if count > MAX_EVENTS:
            raise ScoreError('Too many MIDI events (maximum 25,000).')
        tick += variable()
        if tick > 1_000_000_000 or position >= len(data):
            raise ScoreError('Invalid or excessive MIDI timeline.')
        status = data[position]
        if status >= 128:
            position += 1
        else:
            status = running
        if status is None:
            raise ScoreError('MIDI running status has no preceding channel event.')
        if 0x80 <= status <= 0xef:
            running = status
            size = 1 if status & 0xf0 in (0xc0, 0xd0) else 2
            if position+size > len(data) or any(byte >= 128 for byte in data[position:position+size]):
                raise ScoreError('Invalid MIDI channel-event data.')
        elif status == 0xff:
            if position >= len(data):
                raise ScoreError('Truncated MIDI meta event.')
            kind = data[position]
            position += 1
            size = variable()
            if kind == 0x2f:
                ended = size == 0 and position == len(data)
                if not ended:
                    raise ScoreError('End-of-track must finish its MIDI chunk.')
        elif status in (0xf0, 0xf7):
            running = None
            size = variable()
        else:
            raise ScoreError('Unsupported system event in MIDI file.')
        position += size
        if position > len(data):
            raise ScoreError('Truncated MIDI event payload.')
    if not ended:
        raise ScoreError('MIDI track is missing its end-of-track event.')
    return count


def inspect_midi(data):
    if not data or len(data) > MAX_BYTES:
        raise ScoreError('Choose a MIDI file no larger than 256 KB.')
    if len(data) < 14 or data[:4] != b'MThd':
        raise ScoreError('This is not a Standard MIDI File.')
    header_size = int.from_bytes(data[4:8], 'big')
    if not 6 <= header_size <= 1024 or len(data) < 8+header_size:
        raise ScoreError('Invalid MIDI header size.')
    format_, track_count, resolution = struct.unpack('>HHH', data[8:14])
    if format_ not in (0, 1):
        raise ScoreError('Only synchronous MIDI formats 0 and 1 are supported.')
    if not 1 <= track_count <= MAX_TRACKS or (format_ == 0 and track_count != 1):
        raise ScoreError('Invalid or excessive MIDI track count (maximum 64).')
    if not 1 <= resolution <= 32767:
        raise ScoreError('SMPTE timing is not supported; use ticks-per-quarter MIDI.')
    position, chunks, event_count = 8+header_size, 0, 0
    while position < len(data):
        if data[position:position+4] != b'MTrk' or position+8 > len(data):
            raise ScoreError('Invalid MIDI track chunk.')
        size = int.from_bytes(data[position+4:position+8], 'big')
        if position+8+size > len(data):
            raise ScoreError('Truncated MIDI track data.')
        event_count += validate_track(data[position+8:position+8+size])
        if event_count > MAX_EVENTS:
            raise ScoreError('Too many MIDI events (maximum 25,000).')
        position += 8+size
        chunks += 1
        if position > len(data) or chunks > MAX_TRACKS:
            raise ScoreError('Truncated or excessive MIDI track data.')
    if chunks != track_count:
        raise ScoreError('MIDI track count does not match its header.')
    try:
        midi = mido.MidiFile(file=BytesIO(data), clip=False)
    except (EOFError, OSError, ValueError, KeyError, IndexError, OverflowError, struct.error) as error:
        raise ScoreError('Malformed MIDI events: '+str(error)) from error
    events, notes, tracks, warnings = [], [], [], []
    warning_count = 0

    def warn(message):
        nonlocal warning_count
        warning_count += 1
        if len(warnings) < 20:
            warnings.append(message)

    for track_index, track in enumerate(midi.tracks):
        tick, pending, name = 0, defaultdict(deque), ''
        for index, message in enumerate(track):
            if len(events) >= MAX_EVENTS:
                raise ScoreError('Too many MIDI events (maximum 25,000).')
            tick += message.time
            if tick > 1_000_000_000:
                raise ScoreError('MIDI timeline exceeds the supported tick range.')
            raw = message.dict()
            delta = raw.pop('time')
            events.append({'tick': tick, 'delta_ticks': delta, 'track': track_index, 'index': index, 'message': raw})
            if message.type == 'track_name' and not name:
                name = message.name
            if message.type == 'set_tempo' and message.tempo <= 0:
                raise ScoreError('MIDI tempo must be positive.')
            if message.type not in ('note_on', 'note_off'):
                continue
            key = message.channel, message.note
            if message.type == 'note_on' and message.velocity:
                if pending[key]:
                    warn(f'Overlapping pitch {message.note}, track {track_index+1}, channel {message.channel+1}: note-offs paired in onset order.')
                note = {'id': f't{track_index}:n{index}', 'track': track_index, 'channel': message.channel,
                        'midi': message.note, 'velocity': message.velocity, 'start_tick': tick, 'end_tick': None}
                pending[key].append(note)
                notes.append(note)
            elif pending[key]:
                note = pending[key].popleft()
                note['end_tick'] = tick
                note['release_velocity'] = message.velocity
            else:
                warn(f'Unmatched note-off: pitch {message.note}, track {track_index+1}, channel {message.channel+1}.')
        for queue in pending.values():
            for note in queue:
                warn(f"No note-off for {note['id']}; duration is unknown.")
        tracks.append({'index': track_index, 'name': name or f'Track {track_index+1}', 'end_tick': tick})
    if not notes:
        raise ScoreError('The MIDI file contains no note attacks.')
    events.sort(key=lambda event: (event['tick'], event['track'], event['index']))
    notes.sort(key=lambda note: (note['start_tick'], note['track'], note['id']))
    tempo_map = [{'tick': 0, 'microseconds_per_quarter': 500000, 'seconds': 0.0}]
    for event in events:
        if event['message']['type'] == 'set_tempo':
            previous = tempo_map[-1]
            elapsed = (event['tick']-previous['tick'])*previous['microseconds_per_quarter']/resolution/1_000_000
            tempo_map.append({'tick': event['tick'], 'microseconds_per_quarter': event['message']['tempo'], 'seconds': previous['seconds']+elapsed})
    tempo_ticks = [entry['tick'] for entry in tempo_map]

    def seconds(tick):
        tempo = tempo_map[bisect_right(tempo_ticks, tick)-1]
        return tempo['seconds']+(tick-tempo['tick'])*tempo['microseconds_per_quarter']/resolution/1_000_000

    end_tick = max(track['end_tick'] for track in tracks)
    return {'version': 1, 'format': format_, 'ticks_per_quarter': resolution,
            'sha256': sha256(data).hexdigest(), 'tracks': tracks, 'events': events, 'notes': notes,
            'tempo_map': tempo_map, 'duration_ticks': end_tick, 'duration_seconds': seconds(end_tick),
            'warnings': warnings, 'warning_count': warning_count,
            'notation': 'Performance data: spelling, hands, voices and printed rhythms are not recovered.',
            'licence': 'Local user file; redistribution permission has not been assessed.'}
