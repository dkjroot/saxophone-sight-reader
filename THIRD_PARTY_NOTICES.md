# Third-party software and assets

Reviewed 20 October 2026 against the dependency manifests and bundled asset
notices. Application GPLv3 does not replace these components' own licenses.

| Component | Credit/source | License and retained notices |
| --- | --- | --- |
| Flask 3.1.3; Werkzeug, Jinja2, MarkupSafe, itsdangerous and Click | [Pallets projects and contributors](https://palletsprojects.com/) | BSD-3-Clause; installed distributions retain full notices |
| Blinker (Flask dependency) | [Jason Kirtland and contributors](https://github.com/pallets-eco/blinker) | MIT |
| mido 1.3.3 | [Ole Martin Bjorndalen and contributors](https://github.com/mido/mido) | MIT; installed distribution retains its notice |
| packaging (mido dependency) | [Python Packaging Authority and contributors](https://github.com/pypa/packaging) | Apache-2.0 OR BSD-2-Clause |
| Playwright 1.62.1 (development only) | [Microsoft and contributors](https://github.com/microsoft/playwright) | Apache-2.0; browser downloads retain their own component licenses |
| VexFlow 5.0.0 (bundled) | [VexFlow authors](https://github.com/vexflow/vexflow) | MIT; [full license](static/vendor/vexflow-5.0.0/LICENSE-MIT.txt), [authors](static/vendor/vexflow-5.0.0/AUTHORS.md), [provenance](static/vendor/vexflow-5.0.0/NOTICES.md) |
| Embedded Bravura and Academico fonts | Steinberg Media Technologies GmbH | SIL OFL 1.1; [Bravura terms](static/vendor/vexflow-5.0.0/bravura-OFL.txt), [Academico terms](static/vendor/vexflow-5.0.0/academico-OFL.txt), reserved names and source hashes retained |
| Salamander Grand Piano V2 recordings | Alexander Holm, via the Tone.js audio collection | CC BY 3.0; [credits and adaptation description](static/audio/salamander/NOTICES.md), [full license](static/audio/salamander/CC-BY-3.0.txt), source README and hashes retained |
| Historical melodies in the sax library | Traditional spiritual, James F. Hanley, Scott Joplin and contributing editions | Public-domain sources and [edition-specific credits](static/library/NOTICES.md) |
| Mutopia test fixtures | Individual composers, editors and typesetters | Edition-specific public-domain dedications or CC BY-SA 4.0; [fixture credits](tests/fixtures/piano-library/NOTICES.md) and [CC BY-SA terms](tests/fixtures/piano-library/CC-BY-SA-4.0.txt) |

MIT/BSD/Apache components permit use in the GPL application while retaining their
notices. The music, recordings, and fonts are separately identified assets and
keep their own terms. Preserve all accompanying license/credit files with copies;
attribute CC assets, identify changes, honor share-alike for applicable music
adaptations and OFL conditions for fonts. The GPL does not grant rights to privately
imported scores, MIDI files, or recordings. Source licenses and credits, rather
than a composer's age alone, govern the particular bundled edition.

The retained piano banner, `static/assets/score-banner-v1.png`, was generated
for the original project with OpenAI’s image generation tool on 16 October 2026.
It used no external score or reference image.

Before distributing a Python/browser runtime or installer, include the notices
and any corresponding source required by the exact binaries packaged. This
review covers the source checkout and existing bundled assets, not every future
dependency resolution or platform build. See [LICENSING.md](LICENSING.md).
