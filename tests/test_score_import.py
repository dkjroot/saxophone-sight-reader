from io import BytesIO
from pathlib import Path
import struct
import unittest
from unittest.mock import patch
import mido
from app import app
from score_import import inspect_midi, ScoreError, MAX_BYTES, validate_track

FIXTURE = Path(__file__).parent/'fixtures'/'polyphony.mid'


def file_bytes(messages):
    midi = mido.MidiFile(type=0)
    midi.tracks.append(mido.MidiTrack(messages))
    buffer = BytesIO()
    midi.save(file=buffer)
    return buffer.getvalue()


class ImportTests(unittest.TestCase):
    def test_polyphony_retains_timing_controllers_and_source_identity(self):
        raw = FIXTURE.read_bytes()
        score = inspect_midi(raw)
        self.assertEqual(score['ticks_per_quarter'], 480)
        self.assertEqual(score['format'], 1)
        self.assertEqual(len(score['tracks']), 2)
        self.assertEqual(score['tracks'][1]['name'], 'Two voices study')
        self.assertEqual([(n['midi'], n['start_tick'], n['end_tick']) for n in score['notes']], [(60, 0, 480), (64, 0, 960), (67, 480, 960)])
        self.assertEqual(score['notes'][0]['velocity'], 100)
        self.assertEqual(score['notes'][0]['release_velocity'], 10)
        self.assertEqual(score['notes'][1]['release_velocity'], 0)
        self.assertAlmostEqual(score['duration_seconds'], 1.1)
        self.assertEqual(score['tempo_map'][-1]['seconds'], .5)
        self.assertEqual(score['duration_ticks'], 960)
        types = [e['message']['type'] for e in score['events']]
        for kind in ['time_signature', 'key_signature', 'program_change', 'control_change']:
            self.assertIn(kind, types)
        self.assertEqual(score['warning_count'], 0)
        self.assertEqual(inspect_midi(raw)['sha256'], score['sha256'])
        self.assertEqual(raw, FIXTURE.read_bytes())

    def test_ambiguous_overlap_and_incomplete_notes_are_not_invented(self):
        raw = file_bytes([mido.Message('note_off', note=61), mido.Message('note_on',note=60), mido.Message('note_on',note=60,time=10), mido.Message('note_off',note=60,time=10), mido.Message('sysex',data=[1,2])])
        score = inspect_midi(raw)
        self.assertEqual(score['warning_count'], 3)
        self.assertEqual(score['notes'][0]['end_tick'], 20)
        self.assertIsNone(score['notes'][1]['end_tick'])
        self.assertEqual(score['events'][-2]['message']['type'], 'sysex')
        self.assertEqual(score['events'][-2]['message']['data'], [1, 2])
        raw = file_bytes([mido.Message('note_on',note=60,channel=0),mido.Message('note_on',note=60,channel=1),mido.Message('note_off',note=60,channel=1,time=10),mido.Message('note_off',note=60,channel=0,time=10)])
        self.assertEqual([n['end_tick'] for n in inspect_midi(raw)['notes']], [20,10])

    def test_invalid_headers_chunks_and_events(self):
        raw = FIXTURE.read_bytes()
        bad = [b'', b'x'*15, b'x'*(MAX_BYTES+1), raw[:8]+struct.pack('>HHH',2,2,480)+raw[14:], raw[:8]+struct.pack('>HHH',1,65,480)+raw[14:], raw[:8]+struct.pack('>HHH',1,2,0x8001)+raw[14:], raw[:-1], raw+b'bad', raw[:8]+struct.pack('>HHH',1,3,480)+raw[14:], file_bytes([]), file_bytes([mido.MetaMessage('set_tempo',tempo=0),mido.Message('note_on',note=60)])]
        for data in bad:
            with self.subTest(size=len(data)), self.assertRaises(ScoreError):
                inspect_midi(data)
        for track in [b'\x81', b'\x00', b'\x81'*5, b'\x00\x3c\x40', b'\x00\x90\x3c\x80', b'\x00\xff', b'\x00\xff\x01\x05', b'\x00\xf8', b'\x00\xff\x2f\x01\x00', b'\x00\x90\x3c\x40']:
            with self.subTest(track=track), self.assertRaises(ScoreError):
                validate_track(track)
        for header_size in [5,1025]:
            with self.assertRaises(ScoreError):
                inspect_midi(raw[:4]+header_size.to_bytes(4,'big')+raw[8:])
        malformed=b'\x00\xff\x51\x00\x00\xff\x2f\x00'
        with self.assertRaisesRegex(ScoreError,'Malformed MIDI'):
            inspect_midi(b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+len(malformed).to_bytes(4,'big')+malformed)
        with patch('score_import.MAX_EVENTS', 14), self.assertRaises(ScoreError):
            inspect_midi(raw)
        with patch('score_import.MAX_EVENTS', 2), self.assertRaises(ScoreError):
            inspect_midi(raw)

    def test_local_route_accepts_raw_bytes_and_reports_limits(self):
        with app.test_client() as client:
            response = client.post('/api/inspect-midi', data=FIXTURE.read_bytes(), content_type='application/octet-stream')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json['notes']), 3)
            response = client.post('/api/inspect-midi', data=b'bad')
            self.assertEqual(response.status_code, 400)
            self.assertIn('Standard MIDI', response.json['error'])
            self.assertEqual(client.post('/api/inspect-midi',data=b'x'*(MAX_BYTES+1)).status_code, 413)


if __name__ == '__main__':
    unittest.main()
