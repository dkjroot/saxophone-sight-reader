"""Local saxophone practice. Live MIDI stays in the browser; file inspection stays on this computer."""
import argparse

from flask import Flask, render_template, request, redirect
from score_import import inspect_midi, ScoreError, MAX_BYTES
from musicxml_import import import_musicxml

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/help")
def help_page():
    return render_template("help.html")


@app.get("/notation-study")
def notation_study():
    study = 'turnaround' if request.args.get('study') == 'turnaround' else 'after-hours'
    return redirect('/?view=study&study=' + study)


@app.post("/api/inspect-midi")
def inspect_local_midi():
    try:
        return inspect_midi(request.get_data(cache=False))
    except ScoreError as error:
        return {"error": str(error)}, 400


@app.errorhandler(413)
def file_too_large(error):
    return {"error": "Choose a file no larger than 256 KB."}, 413


@app.post("/api/import-musicxml")
def import_local_musicxml():
    try:
        return import_musicxml(request.get_data(cache=False))
    except ScoreError as error:
        return {"error": str(error)}, 400


@app.get("/health")
def health():
    return {"status": "ok"}, 200, {"X-Saxophone-Sight-Reader": "1"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    app.run(host="127.0.0.1", port=args.port, debug=False)
