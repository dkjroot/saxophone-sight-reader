"""Local saxophone practice. Live MIDI stays in the browser; file inspection stays on this computer."""
import argparse
import json
from pathlib import Path

from flask import Flask, render_template, request, redirect
from score_import import inspect_midi, ScoreError, MAX_BYTES
from musicxml_import import import_musicxml

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES
app.config["LOCAL_STUDIES_DIR"] = Path(__file__).resolve().parent / "local_studies"

LOCAL_STUDY_KINDS = {
    ".json": "json",
    ".musicxml": "musicxml",
    ".xml": "musicxml",
    ".mid": "midi",
    ".midi": "midi",
}


def _prettify_stem(stem):
    text = stem.replace("-", " ").replace("_", " ").strip()
    if not text:
        return stem
    return text.title() if text == text.lower() else text


def _safe_local_study_path(filename):
    if not filename or filename.startswith(".") or "/" in filename or "\\" in filename or ".." in filename:
        return None, None, 400
    suffix = Path(filename).suffix.lower()
    kind = LOCAL_STUDY_KINDS.get(suffix)
    if not kind:
        return None, None, 400
    base = Path(app.config["LOCAL_STUDIES_DIR"]).resolve()
    if not base.is_dir():
        return None, None, 404
    candidate = (base / filename).resolve()
    if candidate.parent != base or not candidate.is_file():
        return None, None, 404
    return candidate, kind, 200


def _title_from_file(path, kind):
    if kind == "json":
        try:
            if path.stat().st_size <= MAX_BYTES:
                data = json.loads(path.read_text(encoding="utf-8"))
                title = data.get("title") if isinstance(data, dict) else None
                if isinstance(title, str) and title.strip():
                    return title.strip()
        except (OSError, UnicodeDecodeError, ValueError):
            pass
    return _prettify_stem(path.stem)


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


@app.get("/api/local-studies")
def list_local_studies():
    base = Path(app.config["LOCAL_STUDIES_DIR"])
    if not base.is_dir():
        return {"studies": []}
    studies = []
    for entry in sorted(base.iterdir(), key=lambda p: p.name.casefold()):
        if entry.name.startswith(".") or not entry.is_file():
            continue
        kind = LOCAL_STUDY_KINDS.get(entry.suffix.lower())
        if not kind:
            continue
        studies.append({
            "id": entry.name,
            "filename": entry.name,
            "kind": kind,
            "title": _title_from_file(entry, kind),
        })
    return {"studies": studies}


@app.get("/api/local-studies/<filename>")
def get_local_study(filename):
    path, kind, status = _safe_local_study_path(filename)
    if status == 400:
        return {"error": "Invalid local study filename or unsupported format."}, 400
    if status == 404:
        return {"error": "Local study not found."}, 404
    try:
        raw = path.read_bytes()
    except OSError:
        return {"error": "Local study could not be read."}, 400
    if len(raw) > MAX_BYTES:
        return {"error": "Choose a file no larger than 256 KB."}, 413
    if kind == "json":
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return {"error": "Local study JSON is not valid UTF-8 JSON."}, 400
        if not isinstance(data, dict) or data.get("version") != 1:
            return {"error": "Unsupported local study JSON version."}, 400
        return {"kind": "score", "filename": path.name, "score": data}
    try:
        if kind == "musicxml":
            return {"kind": "score", "filename": path.name, "score": import_musicxml(raw)}
        return {"kind": "midi", "filename": path.name, "inspection": inspect_midi(raw)}
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
