import json
from pathlib import Path
import shutil
import tempfile
import unittest
from app import app


SAMPLE_XML = """<?xml version="1.0"?>
<score-partwise version="4.0">
  <work><work-title>Local XML</work-title></work>
  <part-list><score-part id="P1"><part-name>Alto Saxophone</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
  </measure></part>
</score-partwise>"""


class ServerTests(unittest.TestCase):
    def test_page_and_local_assets(self):
        with app.test_client() as client:
            page = client.get('/')
            self.assertEqual(page.status_code, 200)
            self.assertIn(b'Connect MIDI', page.data)
            for asset in ('app.js', 'fingering.js', 'score_practice.js', 'score_workspace.js', 'midi_study.js', 'studies/notation-cases.json', 'score_transport.js',  'engraving.js',  'score_model.js', 'studies/independent-voices.json', 'exercise.js', 'help.js', 'library.js', 'core.js', 'notation.js', 'harmony.js', 'generation.js', 'generation_worker.js', 'generated_stream.js', 'metrics.js', 'progress.js', 'audio.js', 'sound.js', 'score.js', 'outline.js', 'layout.js', 'layout_editor.js', 'transport.js', 'playback.js', 'passages.js', 'keyboard.js', 'flow.js', 'sections.js', 'samples.js', 'beats.js', 'style.css', 'lyre.svg', 'assets/score-banner-v1.png'):
                with client.get('/static/' + asset) as response:
                    self.assertEqual(response.status_code, 200)
            help_page = client.get('/help')
            self.assertEqual(help_page.status_code, 200)
            self.assertIn(b'Start practising this passage', help_page.data)
            self.assertIn(b'Download MIDI data (JSON)', help_page.data)
            self.assertIn(b'aria-label="Close help"', help_page.data)
            self.assertNotIn(b'Open practice', help_page.data)
            self.assertNotIn(b'If you opened this guide', help_page.data)
            self.assertNotIn(b'src="/static/app.js"', help_page.data)
            study = client.get('/notation-study', follow_redirects=True)
            self.assertEqual(study.status_code, 200)
            self.assertIn(b'Passage study', study.data)
            self.assertIn(b'src="/static/app.js"', study.data)
            self.assertEqual(client.get('/health').json, {'status': 'ok'})

    def test_local_studies_listing_and_loading(self):
        previous = app.config['LOCAL_STUDIES_DIR']
        try:
            with tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                app.config['LOCAL_STUDIES_DIR'] = base / 'missing'
                with app.test_client() as client:
                    self.assertEqual(client.get('/api/local-studies').json, {'studies': []})
                    self.assertEqual(client.get('/api/local-studies/demo.json').status_code, 404)

                app.config['LOCAL_STUDIES_DIR'] = base
                (base / 'HOWTO.md').write_text('ignored guide', encoding='utf-8')
                (base / '.hidden.json').write_text('{"version":1,"title":"Hidden"}', encoding='utf-8')
                (base / 'a-study.json').write_text(json.dumps({'version': 1, 'id': 'a', 'title': 'Baker Warmup'}), encoding='utf-8')
                (base / 'bad.json').write_text('{not json', encoding='utf-8')
                (base / 'b-chart.musicxml').write_text(SAMPLE_XML, encoding='utf-8')
                shutil.copy(Path('tests/fixtures/polyphony.mid'), base / 'c-tune.mid')

                with app.test_client() as client:
                    listed = client.get('/api/local-studies')
                    self.assertEqual(listed.status_code, 200)
                    names = [item['filename'] for item in listed.json['studies']]
                    self.assertEqual(names, ['a-study.json', 'b-chart.musicxml', 'bad.json', 'c-tune.mid'])
                    self.assertEqual(listed.json['studies'][0]['title'], 'Baker Warmup')
                    self.assertEqual(listed.json['studies'][1]['title'], 'B Chart')

                    loaded_json = client.get('/api/local-studies/a-study.json')
                    self.assertEqual(loaded_json.status_code, 200)
                    self.assertEqual(loaded_json.json['kind'], 'score')
                    self.assertEqual(loaded_json.json['score']['title'], 'Baker Warmup')

                    loaded_xml = client.get('/api/local-studies/b-chart.musicxml')
                    self.assertEqual(loaded_xml.status_code, 200)
                    self.assertEqual(loaded_xml.json['kind'], 'score')
                    self.assertEqual(loaded_xml.json['score']['title'], 'Local XML')

                    loaded_mid = client.get('/api/local-studies/c-tune.mid')
                    self.assertEqual(loaded_mid.status_code, 200)
                    self.assertEqual(loaded_mid.json['kind'], 'midi')
                    self.assertGreater(len(loaded_mid.json['inspection']['notes']), 0)

                    self.assertEqual(client.get('/api/local-studies/bad.json').status_code, 400)
                    self.assertEqual(client.get('/api/local-studies/HOWTO.md').status_code, 400)
                    self.assertEqual(client.get('/api/local-studies/.hidden.json').status_code, 400)
                    self.assertEqual(client.get('/api/local-studies/..%5Capp.py').status_code, 400)
                    self.assertEqual(client.get('/api/local-studies/..a.json').status_code, 400)
                    self.assertIn(client.get('/api/local-studies/..%2Fapp.py').status_code, (400, 404))
                    self.assertEqual(client.get('/api/local-studies/missing.json').status_code, 404)
        finally:
            app.config['LOCAL_STUDIES_DIR'] = previous


if __name__ == '__main__':
    unittest.main()
