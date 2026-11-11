"""Start the local saxophone workspace, preparing its private Python environment if needed."""
import argparse
import json
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parent


def pinned_requirements():
    result = {}
    for line in (ROOT / 'requirements.txt').read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        match = re.fullmatch(r'([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+-]+)', line)
        if not match:
            raise RuntimeError('requirements.txt needs an exact package==version on each line.')
        result[match[1]] = match[2]
    return result


def prepare_environment():
    if sys.version_info < (3, 10):
        raise RuntimeError('Install Python 3.10 or newer, then start again.')
    environment = ROOT / '.venv'
    python = environment / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.is_file():
        if environment.exists():
            raise RuntimeError('The .venv folder is incomplete. Rename it and start again to create a fresh environment.')
        print('Creating the local Python environment...', flush=True)
        subprocess.run([sys.executable, '-m', 'venv', str(environment)], check=True, cwd=ROOT)
    required = pinned_requirements()
    probe = 'import importlib.metadata as m,json; print(json.dumps({d.metadata["Name"].lower():d.version for d in m.distributions()}))'
    installed = json.loads(subprocess.check_output([str(python), '-c', probe], cwd=ROOT, text=True))
    if any(installed.get(name.lower()) != version for name, version in required.items()):
        print('Installing the versions in requirements.txt into .venv (internet access may be needed)...', flush=True)
        subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(ROOT / 'requirements.txt')], check=True, cwd=ROOT)
    return python


def app_ready(url):
    try:
        # Loopback requests should not be routed through a machine's HTTP proxy.
        with build_opener(ProxyHandler({})).open(url+'/health', timeout=.5) as response:
            return response.headers.get('X-Saxophone-Sight-Reader') == '1' and json.loads(response.read(1024)) == {'status': 'ok'}
    except (OSError, URLError, ValueError):
        return False


def port_in_use(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.3):
            return True
    except OSError:
        return False


def open_workspace(url, no_browser):
    print('Saxophone sight reader: '+url, flush=True)
    if not no_browser:
        try:
            if not webbrowser.open(url):
                print('Open that address in Chrome or Edge.', flush=True)
        except (webbrowser.Error, OSError):
            print('Open that address in Chrome or Edge.', flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8767, help='Local port (default: 8767)')
    parser.add_argument('--no-browser', action='store_true', help='Print the address without opening a browser')
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    url = 'http://127.0.0.1:'+str(args.port)
    try:
        if app_ready(url):
            print('The app is already running; using the existing server.', flush=True)
            open_workspace(url, args.no_browser)
            return 0
        if port_in_use(args.port):
            raise RuntimeError(f'Port {args.port} is being used by another server. Try --port {args.port+1 if args.port<65535 else 8767}.')
        python = prepare_environment()
        process = subprocess.Popen([str(python), str(ROOT / 'app.py'), '--port', str(args.port)], cwd=ROOT)
        try:
            deadline = time.monotonic()+15
            while not app_ready(url):
                if process.poll() is not None:
                    raise RuntimeError('The server could not start. Check the error above and whether the port is available.')
                if time.monotonic() >= deadline:
                    raise RuntimeError('The server did not become ready within 15 seconds. Check the error above and try another port.')
                time.sleep(.1)
            open_workspace(url, args.no_browser)
            print('Keep this window open. Press Ctrl+C here to stop the server.', flush=True)
            return process.wait()
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    except KeyboardInterrupt:
        print('\nSaxophone sight reader stopped.', flush=True)
        return 0
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError) as error:
        print('Could not start saxophone sight reader: '+str(error), file=sys.stderr, flush=True)
        print('See README.md for manual setup and troubleshooting. Your music and settings have not been reset.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
