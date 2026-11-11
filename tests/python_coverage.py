"""Run Python regressions with dependency-free project line coverage."""
from pathlib import Path
import os
import sys
import trace
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class ProjectTrace(trace.Trace):
    def globaltrace_lt(self, frame, why, arg):
        if why != 'call':
            return None
        filename = frame.f_code.co_filename
        # Jinja compiles HTML into Python frames; those are not Python source files.
        if not filename.endswith('.py'):
            return None
        path = os.path.normcase(os.path.abspath(filename))
        if path.startswith(os.path.normcase(str(ROOT))+os.sep) and not path.startswith(os.path.normcase(str(ROOT/'.venv'))+os.sep):
            return self.localtrace
        return None


def run_tests():
    suite = unittest.defaultTestLoader.discover(str(ROOT/'tests'))
    return unittest.TextTestRunner().run(suite).wasSuccessful()


if __name__ == '__main__':
    tracer = ProjectTrace(count=True, trace=False)
    success = tracer.runfunc(run_tests)
    output = ROOT/'test-results'/'python-coverage'
    output.mkdir(parents=True, exist_ok=True)
    tracer.results().write_results(show_missing=True, summary=True, coverdir=str(output))
    sys.exit(0 if success else 1)
