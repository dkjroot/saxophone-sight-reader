import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('run_checks', Path(__file__).with_name('run_checks.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class CheckRunnerTests(unittest.TestCase):
    def run_report(self, failing=False):
        with tempfile.TemporaryDirectory() as folder:
            results = [subprocess.CompletedProcess([], 0, '# tests 17\n', ''),
                       subprocess.CompletedProcess([], 0, '', 'Ran 3 tests\nOK\n'),
                       subprocess.CompletedProcess([], 1 if failing else 0, 'bad whitespace' if failing else '', '')]
            results[1].stdout = f' 26 84% app ({runner.ROOT / "app.py"})\n'
            results[0].stdout += '# static/core.js | 100.00 | 96.43 | 100.00 |\n'
            with patch.object(runner, 'OUTPUT', Path(folder)), patch('sys.argv', ['run_checks.py', '--coverage']), \
                    patch.object(runner.subprocess, 'run', side_effect=results) as commands, contextlib.redirect_stdout(io.StringIO()):
                code = runner.main()
            report = json.loads((Path(folder) / 'report.json').read_text())
            self.assertTrue((Path(folder) / 'javascript.log').is_file())
            self.assertEqual(report['checks'][0]['tests'], 17)
            self.assertEqual(report['checks'][0]['unit_coverage_modules'][0]['branch_percent'], 96.43)
            self.assertEqual(report['checks'][1]['tests'], 3)
            self.assertEqual(report['checks'][1]['line_coverage_modules'][0]['line_percent'], 84)
            self.assertEqual(commands.call_args_list[1].args[0][1], 'tests/python_coverage.py')
            self.assertEqual(report['checks'][3]['status'], 'SKIPPED')
            return code, report

    def test_success_preserves_logs_and_explicitly_marks_browser_skipped(self):
        code, report = self.run_report()
        self.assertEqual(code, 0)
        self.assertTrue(report['passed'])

    def test_failed_check_causes_nonzero_status_and_failed_report(self):
        code, report = self.run_report(True)
        self.assertEqual(code, 1)
        self.assertFalse(report['passed'])


class FailureExcerptTests(unittest.TestCase):
    def test_tap_failure_survives_a_trailing_coverage_table(self):
        text = ('header\nnot ok 8 - wrong pitch matching\n  ---\n  error: expected 60, got 61\n'
                '  stack: file:///project/tests/core.test.js:12:4\n  ...\n'
                + '\n'.join('# coverage row '+str(i) for i in range(100)))
        excerpt = runner.failure_excerpt(text)
        self.assertIn('not ok 8 - wrong pitch matching', excerpt)
        self.assertIn('expected 60, got 61', excerpt)
        self.assertIn('core.test.js:12:4', excerpt)
        self.assertNotIn('coverage row', excerpt)
        self.assertLessEqual(len(excerpt.splitlines()), 18)

    def test_other_failures_keep_the_tail_and_bound_line_lengths(self):
        text = '\n'.join(str(i) for i in range(30))+'\n'+('x'*1000)
        excerpt = runner.failure_excerpt(text)
        self.assertEqual(len(excerpt.splitlines()), 18)
        self.assertEqual(len(excerpt.splitlines()[-1]), 500)
        self.assertIn('29', excerpt)


class CoverageFormatTests(unittest.TestCase):
    def test_flat_and_directory_tables_keep_the_same_module_measurements(self):
        expected = {'file': 'static/core.js', 'line_percent': 100.0, 'branch_percent': 96.0, 'function_percent': 99.0}
        self.assertEqual(runner.javascript_coverage('# static/core.js | 100 | 96 | 99 |'), [expected])
        tree = ('# file | line % | branch % | funcs % |\n# static | | | |\n'
                '#  core.js | 100 | 96 | 99 |\n#  invalid.js | bad | 0 | 0 |\n'
                '# tests | | | |\n#  core.test.js | 100 | 100 | 100 |\n# all files | 100 | 99 | 98 |')
        self.assertEqual(runner.javascript_coverage(tree), [expected])
        self.assertEqual(runner.javascript_coverage('no coverage here'), [])
