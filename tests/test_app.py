import unittest
from app import app


class ServerTests(unittest.TestCase):
    def test_page_and_local_assets(self):
        with app.test_client() as client:
            page = client.get('/')
            self.assertEqual(page.status_code, 200)
            self.assertIn(b'Connect MIDI', page.data)
            for asset in ('app.js', 'score_practice.js', 'score_workspace.js', 'midi_study.js', 'studies/notation-cases.json', 'score_transport.js',  'engraving.js',  'score_model.js', 'studies/independent-voices.json', 'exercise.js', 'help.js', 'library.js', 'core.js', 'notation.js', 'harmony.js', 'generation.js', 'generation_worker.js', 'generated_stream.js', 'metrics.js', 'progress.js', 'audio.js', 'sound.js', 'score.js', 'outline.js', 'layout.js', 'layout_editor.js', 'transport.js', 'playback.js', 'passages.js', 'keyboard.js', 'flow.js', 'sections.js', 'samples.js', 'beats.js', 'style.css', 'lyre.svg', 'assets/score-banner-v1.png'):
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


if __name__ == '__main__':
    unittest.main()
