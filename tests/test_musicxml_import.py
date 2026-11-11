import json
from pathlib import Path
import unittest

from musicxml_import import import_musicxml
from score_import import ScoreError, MAX_BYTES

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'tests/fixtures/piano-library/burgmuller-op100-1-excerpt.musicxml').read_bytes()


class MusicXMLTests(unittest.TestCase):
    def test_reviewed_excerpt_retains_spelling_voices_duration_and_three_ties(self):
        score = import_musicxml(SOURCE)
        self.assertEqual(len(score['measures']), 4)
        self.assertEqual(len(score['voices']), 2)
        self.assertTrue(all('hand' not in voice for voice in score['voices']))
        self.assertEqual(len(score['ties']), 3)
        self.assertEqual(score['provenance']['imported_notes'], 44)
        self.assertEqual(score['provenance']['source_xml'].encode(), SOURCE)
        self.assertEqual(score['tempos'], [{'at': [0, 1], 'bpm': 152}])
        self.assertEqual(score['measures'][1]['events'][0]['notes'][0]['octave'], 6)
        self.assertEqual(score['measures'][0]['events'][-1]['at'], [0, 1])

    def test_inherited_divisions_namespaces_and_explicit_gap_rests(self):
        text = SOURCE.decode().replace('<score-partwise version="4.0">', '<score-partwise xmlns="http://www.musicxml.org/ns/musicxml" version="4.0">')
        text = text.replace('<duration>1</duration>', '<duration>1</duration>', 1)
        score = import_musicxml(text.encode())
        self.assertEqual(len(score['ties']), 3)
        # Remove one melody attack: move the cursor forward rather than inventing a note.
        import xml.etree.ElementTree as ET
        root = ET.fromstring(SOURCE)
        measure = root.find('part/measure')
        note = measure.find('note'); index = list(measure).index(note)
        measure.remove(note)
        forward = ET.Element('forward'); ET.SubElement(forward, 'duration').text = '1'
        measure.insert(index, forward)
        score = import_musicxml(ET.tostring(root))
        gaps = [e for e in score['measures'][0]['events'] if e.get('derived_silence')]
        self.assertEqual([(e['at'], e['value']) for e in gaps], [([0, 1], '8')])

    def test_invalid_and_unsupported_documents_fail_with_diagnostics(self):
        cases = [b'', b'PK compressed', b'\xff', b'<score-partwise>', b'<!DOCTYPE x><score-partwise/>',
                 b'<score-partwise xmlns="https://outside.invalid"/>', b'<score-timewise/>',
                 SOURCE.replace(b'<type>eighth</type>', b'<type>64th</type>', 1),
                 SOURCE.replace(b'<duration>1</duration>', b'<duration>2</duration>', 1),
                 SOURCE.replace(b'<step>G</step>', b'<step>H</step>', 1),
                 SOURCE.replace(b'<step>G</step>', b'', 1),
                 SOURCE.replace(b'<staff>1</staff>', b'<staff>3</staff>', 1),
                 SOURCE.replace(b'<divisions>2</divisions>', b'<divisions>0</divisions>'),
                 SOURCE.replace(b'<note>', b'<note><grace/>', 1),
                 SOURCE.replace(b'<note>', b'<note><time-modification/>', 1),
                 SOURCE.replace(b'tempo="152"', b'tempo="152" dacapo="yes"'),
                 SOURCE.replace(b'</measure>', b'<barline><repeat direction="backward"/></barline></measure>', 1),
                 SOURCE.replace(b'<tie type="start" />', b'<tie type="stop" />', 1),
                 SOURCE.replace(b'<duration>8</duration>', b'<duration>9</duration>', 1),
                 SOURCE+b' '*(MAX_BYTES+1)]
        for data in cases:
            with self.subTest(data=data[:60]), self.assertRaises(ScoreError):
                import_musicxml(data)

    def test_unrendered_annotations_are_preserved_and_disclosed(self):
        text = SOURCE.replace(b'<type>eighth</type>', b'<type>eighth</type><notations><slur type="start"/><technical><fingering>5</fingering></technical></notations>', 1)
        score = import_musicxml(text)
        self.assertIn('slur', score['provenance']['warnings'][0])
        self.assertIn('technical', score['provenance']['warnings'][0])
        self.assertIn('<fingering>5</fingering>', score['provenance']['source_xml'])

    def test_dotted_rests_and_enharmonic_spelling_keep_exact_time(self):
        data = b'''<score-partwise><part id="P1"><measure number="1"><attributes>
        <divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time>
        <key><fifths>-7</fifths></key><staves>2</staves></attributes>
        <note><rest/><duration>3</duration><voice>1</voice><type>quarter</type><dot/><staff>1</staff></note>
        <note><pitch><step>B</step><alter>1</alter><octave>3</octave></pitch><duration>3</duration>
        <voice>1</voice><type>quarter</type><dot/><accidental cautionary="yes">sharp</accidental><staff>1</staff></note>
        <backup><duration>6</duration></backup><note><rest/><duration>6</duration><voice>2</voice>
        <type>half</type><dot/><staff>2</staff></note></measure></part></score-partwise>'''
        score = import_musicxml(data)
        measure = score['measures'][0]
        self.assertEqual(measure['length'], [3, 1])
        self.assertEqual(measure['key'], 'Cb')
        self.assertEqual(measure['events'][1]['at'], [3, 2])
        note = measure['events'][1]['notes'][0]
        self.assertEqual((note['letter'], note['accidental'], note['octave']), ('B', 1, 3))
        self.assertTrue(note['courtesy'])
        self.assertEqual(score['tempos'][0]['bpm'], 120)

    def test_route_is_bounded_and_never_saves_local_files(self):
        from app import app
        with app.test_client() as client:
            self.assertEqual(client.post('/api/import-musicxml', data=SOURCE).status_code, 200)
            response = client.post('/api/import-musicxml', data=b'<!DOCTYPE x><score-partwise/>')
            self.assertEqual(response.status_code, 400)
            self.assertIn('DTD', response.json['error'])
            self.assertEqual(client.post('/api/import-musicxml', data=b'x'*(MAX_BYTES+1)).status_code, 413)

    def test_reviewed_notation_rebuilds_offline_and_rejects_changed_excerpt(self):
        from tools.build_library import compile_notation
        library = ROOT / 'tests/fixtures/piano-library'
        catalogue = json.loads((library/'catalogue.json').read_text(encoding='utf-8'))
        entry = next(e for e in catalogue['pieces'] if e['id'] == 'burgmuller-op100-1')
        score = compile_notation(library, entry)
        self.assertEqual(score, json.loads((library/entry['notation_excerpt']['inspection']).read_text(encoding='utf-8')))
        wrong = {**entry, 'notation_excerpt': {**entry['notation_excerpt'], 'sha256': 'wrong'}}
        with self.assertRaises(ValueError):
            compile_notation(library, wrong)
