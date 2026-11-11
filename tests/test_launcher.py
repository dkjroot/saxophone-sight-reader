import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import launch


class LauncherTests(unittest.TestCase):
    def call(self, *args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result = launch.main(list(args))
        return result, output.getvalue()

    def test_existing_app_is_reused_without_installing_or_stopping_it(self):
        with patch.object(launch, 'app_ready', return_value=True), patch.object(launch, 'prepare_environment') as prepare, patch.object(launch.webbrowser, 'open', return_value=True) as browser:
            result, text = self.call('--port', '8767')
        self.assertEqual(result, 0)
        self.assertIn('already running', text)
        prepare.assert_not_called()
        browser.assert_called_once_with('http://127.0.0.1:8767')

    def test_foreign_server_is_not_reused_or_terminated(self):
        with patch.object(launch, 'app_ready', return_value=False), patch.object(launch, 'port_in_use', return_value=True), patch.object(launch, 'prepare_environment') as prepare:
            result, text = self.call('--port', '9000', '--no-browser')
        self.assertEqual(result, 1)
        self.assertIn('--port 9001', text)
        prepare.assert_not_called()

    def test_dependency_setup_is_private_and_only_installs_mismatched_pins(self):
        with tempfile.TemporaryDirectory(prefix='piano launcher ') as folder:
            root = Path(folder)
            (root/'requirements.txt').write_text('Flask==3.1.3\nmido==1.3.3\n', encoding='utf-8')
            python = root/'.venv'/('Scripts/python.exe' if launch.sys.platform == 'win32' else 'bin/python')
            def create(*args, **kwargs):
                python.parent.mkdir(parents=True)
                python.touch()
            with patch.object(launch, 'ROOT', root), patch.object(launch.subprocess, 'run', side_effect=create) as run, patch.object(launch.subprocess, 'check_output', return_value='{"flask":"3.1.3","mido":"1.3.3"}'):
                self.assertEqual(launch.prepare_environment(), python)
                self.assertEqual(run.call_count, 1)
                self.assertIn('venv', run.call_args.args[0])
            with patch.object(launch, 'ROOT', root), patch.object(launch.subprocess, 'run') as run, patch.object(launch.subprocess, 'check_output', return_value='{"flask":"3.0.0"}'):
                launch.prepare_environment()
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0], [str(python), '-m', 'pip', 'install', '-r', str(root/'requirements.txt')])
            with patch.object(launch, 'ROOT', root), patch.object(launch.subprocess, 'run') as run, patch.object(launch.subprocess, 'check_output', return_value='{"flask":"3.1.3","mido":"1.3.3"}'):
                launch.prepare_environment(); run.assert_not_called()
            (root/'requirements.txt').write_text('Flask>=3\n', encoding='utf-8')
            with patch.object(launch, 'ROOT', root), self.assertRaisesRegex(RuntimeError, 'exact'):
                launch.pinned_requirements()

    def test_incomplete_environment_and_install_failure_report_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root/'.venv').mkdir()
            with patch.object(launch, 'ROOT', root), self.assertRaisesRegex(RuntimeError, 'Rename'):
                launch.prepare_environment()
        with patch.object(launch, 'app_ready', return_value=False), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', side_effect=subprocess.CalledProcessError(1, ['pip'])):
            result, text = self.call('--no-browser')
        self.assertEqual(result, 1); self.assertIn('manual setup', text)

    def test_browser_opens_after_readiness_and_server_remains_foreground(self):
        process = MagicMock(); process.poll.side_effect = [None, 0]; process.wait.return_value = 0
        with patch.object(launch, 'app_ready', side_effect=[False, False, True]), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', return_value=Path('local python')), patch.object(launch.subprocess, 'Popen', return_value=process) as start, patch.object(launch.time, 'sleep'), patch.object(launch.webbrowser, 'open', return_value=True) as browser:
            result, text = self.call()
        self.assertEqual(result, 0); self.assertIn('Ctrl+C', text)
        self.assertEqual(start.call_args.args[0][0], 'local python')
        browser.assert_called_once(); process.terminate.assert_not_called()

    def test_timeout_and_ctrl_c_clean_up_only_the_owned_child(self):
        process = MagicMock(); process.poll.return_value = None
        with patch.object(launch, 'app_ready', return_value=False), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', return_value=Path('python')), patch.object(launch.subprocess, 'Popen', return_value=process), patch.object(launch.time, 'monotonic', side_effect=[0, 16]):
            result, text = self.call('--no-browser')
        self.assertEqual(result, 1); self.assertIn('15 seconds', text); process.terminate.assert_called_once()
        process = MagicMock(); process.poll.return_value = None; process.wait.side_effect = [KeyboardInterrupt, 0]
        with patch.object(launch, 'app_ready', side_effect=[False, True]), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', return_value=Path('python')), patch.object(launch.subprocess, 'Popen', return_value=process):
            result, text = self.call('--no-browser')
        self.assertEqual(result, 0); self.assertIn('stopped', text); process.terminate.assert_called_once()

    def test_health_identity_and_browser_failure_are_explicit(self):
        response = MagicMock(); response.__enter__.return_value = response
        response.headers = {'X-Saxophone-Sight-Reader': '1'}; response.read.return_value = b'{"status":"ok"}'
        with patch.object(launch, 'build_opener') as opener:
            opener.return_value.open.return_value = response
            self.assertTrue(launch.app_ready('http://127.0.0.1:8767'))
            response.headers = {}; self.assertFalse(launch.app_ready('http://127.0.0.1:8767'))
        with patch.object(launch.webbrowser, 'open', return_value=False), contextlib.redirect_stdout(io.StringIO()) as output:
            launch.open_workspace('http://127.0.0.1:8767', False)
        self.assertIn('Chrome or Edge', output.getvalue())
        with patch.object(launch.webbrowser, 'open', side_effect=OSError('No browser')), contextlib.redirect_stdout(io.StringIO()) as output:
            launch.open_workspace('http://127.0.0.1:8767', False)
        self.assertIn('Chrome or Edge', output.getvalue())

    def test_server_exit_and_forced_timeout_cleanup_report_errors(self):
        process = MagicMock(); process.poll.return_value = 1
        with patch.object(launch, 'app_ready', return_value=False), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', return_value=Path('python')), patch.object(launch.subprocess, 'Popen', return_value=process):
            result, text = self.call('--no-browser')
        self.assertEqual(result, 1); self.assertIn('could not start', text); process.terminate.assert_not_called()
        process = MagicMock(); process.poll.return_value = None
        process.wait.side_effect = [subprocess.TimeoutExpired('python', 5), 0]
        with patch.object(launch, 'app_ready', return_value=False), patch.object(launch, 'port_in_use', return_value=False), patch.object(launch, 'prepare_environment', return_value=Path('python')), patch.object(launch.subprocess, 'Popen', return_value=process), patch.object(launch.time, 'monotonic', side_effect=[0, 16]):
            result, text = self.call('--no-browser')
        self.assertEqual(result, 1); process.terminate.assert_called_once(); process.kill.assert_called_once()

    def test_unsupported_python_and_invalid_port_fail_before_setup(self):
        with patch.object(launch.sys, 'version_info', (3, 9)), self.assertRaisesRegex(RuntimeError, '3.10'):
            launch.prepare_environment()
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            launch.main(['--port', '65536'])
        self.assertEqual(error.exception.code, 2)
