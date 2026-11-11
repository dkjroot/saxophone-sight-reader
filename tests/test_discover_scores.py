import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from tools import discover_scores as scores

URL = scores.BASE+'cgibin/piece-info.cgi?id=470'


def piece(licence='Public Domain', link='../legal.html#publicdomain', instrument='Piano'):
    return f"""<h2>Prelude &amp; study</h2><h4>by Composer (1810–1849)</h4>
    <table><td><b>Instrument(s):</b> {instrument}</td><td>Style: Romantic</td>
    <td>Source: Original edition</td><td>Maintainer: Typesetter</td>
    <td>Copyright: <a href='{link}'>{licence}</a></td></table>
    <a href='/ftp/Test/test.mid'>MIDI file</a><a href='/ftp/Test/test-lys.zip'>LilyPond source</a>
    <a href='/ftp/Test/test-a4.pdf'>PDF</a><a href='https://outside.invalid/test.mid'>MIDI</a>"""


class DiscoveryTests(unittest.TestCase):
    def test_metadata_and_conservative_licence_policy(self):
        item, reason = scores.candidate(piece(), URL, 'now')
        self.assertIsNone(reason)
        self.assertEqual(item['id'], 'mutopia:470')
        self.assertEqual(item['title'], 'Prelude & study')
        self.assertEqual(item['composer'], 'Composer (1810–1849)')
        self.assertEqual(item['edition'], 'Original edition')
        self.assertEqual(item['contributor'], 'Typesetter')
        self.assertEqual(len(item['metadata_sha256']), 64)
        self.assertTrue(item['review_required'])
        self.assertEqual([a['kind'] for a in item['assets']], ['midi', 'source', 'pdf'])
        for licence, link in [('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'), ('Public Domain', 'https://outside.invalid/legal.html#publicdomain'), ('', '')]:
            self.assertIsNone(scores.candidate(piece(licence, link), URL, 'now')[0])
        self.assertIsNotNone(scores.candidate(piece('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'), URL, 'now')[0])
        self.assertIsNone(scores.candidate(piece(instrument='Voice, Piano'), URL, 'now')[0])
        for fragment in ['<h2>Prelude &amp; study</h2>', '<h4>by Composer (1810–1849)</h4>', '<td>Source: Original edition</td>', "<a href='/ftp/Test/test.mid'>MIDI file</a>"]:
            self.assertIsNone(scores.candidate(piece().replace(fragment, ''), URL, 'now')[0])

    def test_keyboard_alternatives_midi_archives_and_explicit_sharealike_opt_in(self):
        for instrument in ['Harpsichord, Piano', 'Pianoforte', 'Clavichord', 'Piano, Harpsichord, Clavichord']:
            self.assertIsNotNone(scores.candidate(piece(instrument=instrument), URL, 'now')[0])
        for instrument in ['Voice, Piano', 'Piano four hands', 'Piano, Piano', 'Organ', '']:
            self.assertIsNone(scores.candidate(piece(instrument=instrument), URL, 'now')[0])
        archive = piece().replace('/ftp/Test/test.mid', '/ftp/Test/test-mids.zip')
        self.assertEqual(scores.candidate(archive, URL, 'now')[0]['assets'][0]['kind'], 'midi-archive')
        sa = piece('Creative Commons Attribution-ShareAlike 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/')
        self.assertIsNone(scores.candidate(sa, URL, 'now')[0])
        self.assertIsNotNone(scores.candidate(sa, URL, 'now', include_by_sa_4=True)[0])
        for bad in [sa.replace('by-sa/4.0', 'by-nc-sa/4.0'), sa.replace('creativecommons.org', 'outside.invalid'), sa.replace('ShareAlike 4.0', 'ShareAlike 2.5')]:
            self.assertIsNone(scores.candidate(bad, URL, 'now', include_by_sa_4=True)[0])
        report = scores.discover(load=lambda url: "<a href='piece-info.cgi?id=470'>piece</a>" if 'make-table' in url else sa, delay=lambda _: None, include_by_sa_4=True)
        self.assertEqual(len(report['candidates']), 1)
        self.assertIn('Explicit opt-in', report['policy'])

    def test_urls_and_duplicate_piece_links(self):
        self.assertEqual(scores.source_url('http://mutopiaproject.org/ftp/a.mid'), scores.BASE+'ftp/a.mid')
        for url in ['https://outside.invalid/a.mid', 'javascript:alert(1)', 'https://user@mutopiaproject.org/a', 'https://mutopiaproject.org:8080/a']:
            self.assertIsNone(scores.source_url(url))
        page = scores.Page("<a href='piece-info.cgi?id=470'>A</a><a href='piece-info.cgi?id=470'>duplicate</a><a href='piece-info.cgi?id=oops'>bad</a><a href='https://outside.invalid/piece-info.cgi?id=9'>external</a>")
        self.assertEqual(scores.piece_links(page, URL), [URL])

    def test_pagination_limits_and_partial_failure(self):
        calls = []
        def load(url):
            calls.append(url)
            if 'make-table' in url:
                if 'startat' in url:
                    return "<a href='piece-info.cgi?id=3'>3</a><a href='piece-info.cgi?id=4'>4</a><a href='make-table.cgi?startat=10'>Next 10</a>"
                return "<a href='piece-info.cgi?id=1'>1</a><a href='piece-info.cgi?id=2'>2</a><a href='make-table.cgi?startat=10'>Next 10</a>"
            if url.endswith('id=1'):
                return piece('CC BY', 'https://creativecommons.org/licenses/by/4.0/')
            if url.endswith('id=2'):
                raise OSError('offline')
            return piece()
        report = scores.discover('ChopinFF', limit=1, max_review=8, load=load, delay=lambda _: None)
        self.assertEqual(report['reviewed'], 3)
        self.assertEqual(len(report['candidates']), 1)
        self.assertEqual(len(report['skipped']), 1)
        self.assertEqual(len(report['errors']), 1)
        self.assertEqual(len(calls), 5)
        limited = scores.discover(limit=8, max_review=1, load=load, delay=lambda _: None)
        self.assertEqual(limited['reviewed'], 1)
        report = scores.discover(load=lambda _: '', delay=lambda _: None)
        self.assertEqual(report['reviewed'], 0)
        self.assertEqual(scores.discover(load=lambda _: "<a href='make-table.cgi?startat=10'>Next 10</a>", delay=lambda _: None)['reviewed'], 0)

    def test_fetch_boundaries_and_external_redirect(self):
        with self.assertRaises(ValueError):
            scores.fetch('https://outside.invalid/')
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'<h2>Score</h2>'
        with patch.object(scores, 'build_opener') as opener:
            opener.return_value.open.return_value = response
            self.assertEqual(scores.fetch(URL), '<h2>Score</h2>')
            response.read.return_value = b'x'*(scores.MAX_BYTES+1)
            with self.assertRaises(ValueError):
                scores.fetch(URL)
        with self.assertRaises(ValueError):
            scores.SourceRedirects().redirect_request(None, None, 302, '', {}, 'https://outside.invalid/')

    def test_cli_reports_no_import_and_failures(self):
        report = scores.discover(load=lambda url: "<a href='piece-info.cgi?id=470'>piece</a>" if 'make-table' in url else piece(), delay=lambda _: None)
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            output = Path(directory)/'scores.json'
            with patch.object(scores, 'discover', return_value=report):
                self.assertEqual(scores.main(['--output', str(output)]), 0)
                self.assertEqual(json.loads(output.read_text(encoding='utf-8'))['candidates'][0]['id'], 'mutopia:470')
                self.assertIn('No score files were downloaded', output.with_suffix('.md').read_text(encoding='utf-8'))
            with patch.object(scores, 'discover', side_effect=OSError('offline')):
                self.assertEqual(scores.main(['--output', str(output)]), 1)
            for args in [['--composer', '../'], ['--limit', '0'], ['--limit', '4', '--max-review', '1']]:
                with self.assertRaises(SystemExit):
                    scores.main(args)


if __name__ == '__main__':
    unittest.main()
