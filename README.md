# Saxophone Sight Reader

I built this to practise reading with my Roland Aerophone GO. It probably works with other midi devices, but the music is focussed on Sax. Look in my github for my Piano Sight Reader project too, if keyboards are your thing!  

You get one treble-staff line at a time, from simple pitch drills to blues scales, bebop scales and ii–V–I lines. There are eight built-in tunes, and you can bring your own MIDI or MusicXML files. The app runs on your computer.

## Licence and support

**[Support my work on Buy Me a Coffee](https://buymeacoffee.com/dkjroot)**

I develop this project to be freely available to everyone, supported, if at all,
by voluntary contributions. I do not want other people to profit from my work
by selling copies, putting it behind a paywall, or building a paid application
or hosted service around it. I ask you to respect that intention: please keep
this work freely available, credit its origins, and direct people to
[my official GitHub repository](https://github.com/dkjroot/saxophone-sight-reader) for the software.

If you want to help fund my development, please contribute **directly to me**
through [Buy Me a Coffee](https://buymeacoffee.com/dkjroot). Paying a distributor
or hosting provider does not fund my work unless I explicitly say otherwise.
There is no obligation to contribute.

**This is a personal request.** The
[GNU General Public License v3.0](LICENSE) permits commercial use and
redistribution, including forks, subject to its terms. Those legal permissions
remain unchanged by this request. See [licensing details](LICENSING.md) and
[third-party credits](THIRD_PARTY_NOTICES.md).

## Install and run

You’ll need **Python 3.10 or newer** and a desktop browser. Use **Chrome or
Edge** for MIDI. Clone this repository or choose **Code → Download ZIP** on
GitHub and extract it. If you need to install Python, get it from
[Python.org](https://www.python.org/downloads/).

- **Windows:** Open the extracted project folder and double-click
  `start.cmd`. You can also run `py -3 launch.py` in PowerShell from that
  folder if your Python installation includes the `py` launcher.
- **macOS or Linux:** Open a terminal in the project folder and run
  `python3 launch.py`.

The first run creates a local `.venv` and installs Flask and mido from
`requirements.txt`. It may need an internet connection for those packages.
The launcher starts the app at [http://127.0.0.1:8767](http://127.0.0.1:8767)
and opens your default browser. If it opens in another browser, copy the
address into Chrome or Edge. Keep the launcher window open while you play.
Press **Ctrl+C** there to stop it.

## Connect and set up MIDI

The app reads notes from a MIDI wind controller. You can try it without one
by clicking the buttons in the **Pitch monitor**, or by focusing a pitch
button and pressing **Space** or **Enter**.

1. **Connect the Aerophone GO over USB.** Use the supplied USB Type-A cable
   for the computer connection, then switch the instrument on. In Chrome
   or Edge, click **Connect MIDI**, allow access, and choose the Aerophone
   under **Input**. Play a note and check **Played** in the Pitch monitor.
   [Roland Aerophone GO manual](https://static.roland.com/assets/media/pdf/AE-05_eng01_W.pdf)
2. **Check the octave and transposition.** With the Aerophone’s **Transpose**
   knob at **C**, start with **Instrument → MIDI pitch mapping → Written pitch
   · Aerophone in C**. If you use a transposed setting, click **Calibrate
   written C4** and play the C on the first ledger line below the treble staff.
   The app measures the MIDI note and accounts for the octave as well. The
   concert-pitch presets are also available if you know what your controller
   sends.
3. **Set your playable range.** The default written range is **B♭3–F♯6**.
   Under **Instrument**, adjust **Lowest written note** and **Highest written
   note**, or use **Learn lowest note** and **Learn highest note** and play
   each endpoint. **Reading register** in **Practice setup** narrows the
   exercise further. **Core · D4–D5** is a good place to start.

**Bluetooth MIDI on a Mac:** Set the Aerophone’s power switch to the Bluetooth
symbol so the blue light blinks. Open **Audio MIDI Setup**, choose
**Window → Show MIDI Studio**, then **Configure Bluetooth**. Select the
**AE‑05** and click **Connect**. Back in the browser, click **Connect MIDI**
or **Refresh MIDI** and choose the input. If the Bluetooth MIDI port stays
unavailable, try USB.
[Apple’s Bluetooth MIDI setup guide](https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac)
· [Roland’s note on previously paired iPhones](https://support.roland.com/hc/en-us/articles/10780229026715-Aerophone-GO-AE-05-AE-05-not-displayed-in-Aerophone-GO-Plus-MIDI-selection-list)

## Your first exercise

1. Choose **Pitch practice** at the top of the page. Under **Practice setup**,
   choose **Pitch drills** in **Source**, **C major / A minor** in **Key**, and
   **Core · D4–D5** in **Reading register**. Try **Blues scale**, **Dominant
   bebop scale** or **ii–V–I arpeggios** when you want a different line.
2. Play the marked note on the staff. The app waits for the correct pitch,
   and the arrow tells you whether to play higher or lower. **Show note names**
   gives you the written names. **Mark target** puts a diamond on the matching
   pitch button.
3. Leave **Advancement** on **Fluid** to slur between different pitches.
   Articulate repeated notes afresh. **Release each note** waits for the
   release before advancing. **Repeat passage** loops the same line,
   **Continuous** keeps going, and **Stop at end** gives you one pass.
   **Scrolling** and **Look-ahead** control how much notation you see.

Use the Aerophone’s own sound or enable **Sound my playing** for browser
audio. **Hear target** plays a reference note, and **Metronome** gives you a
click. You can turn on **Save history locally** under **Progress** to keep
your response times and first-try accuracy between visits.

## Practise a tune

Scroll to **MIDI files & library**. Choose a **Piece**, click **Load piece**,
then click **Start practising this passage**. Loading opens a preview, so
you can listen with **Play source passage** or choose a shorter section
first. The library includes *Indiana*, *Swing Low, Sweet Chariot*, an
excerpt from *The Entertainer*, and five originals in blues, swing, ballad,
bossa nova and funk styles. All eight use written sax pitch.
[Music credits and source editions](static/library/NOTICES.md)

- In **Pitch practice**, the **MIDI melody** source waits for each pitch.
  Switch **Source** back to **Pitch drills** whenever you want a new exercise.
- In **Passage study**, choose **Loaded MIDI passage** or try **After Hours**
  and **Turnaround**. Click **Play study** to listen or **Practise passage** to
  work through the pitches, holds and rests. Use **Speed**, **Entry beat** and
  **Exit beat** to work on a short section. For MIDI tunes, the study derives
  rhythm on a 1/32-note grid and skips overlapping attacks to keep one
  playable line.

## Bring your own music

- **MIDI:** In **MIDI files & library**, use **Choose MIDI file** for a
  `.mid` or `.midi` file up to 256 KB. Select the melody track, choose a
  section or adjust **First attack** and **Last attack**, then start practising.
  If several selected notes start together, the app takes the highest one in
  your range. Use **File pitch mapping** to convert a concert-pitch file to
  written sax pitch. The instrument’s live mapping is a separate setting.
  **Save passage** remembers the selection when you reopen the same file.
- **MusicXML:** Switch to **Passage study** and use **Import MusicXML**.
  Choose an uncompressed score-partwise `.musicxml` or `.xml` file up to
  256 KB with one treble staff and one voice. The importer uses its written
  pitches and supports ordinary and dotted notes, rests and ties. Use a file
  with explicit note values. Tuplets, grace notes, repeat traversal and DTD
  declarations are outside the supported subset.

Imported music stays in memory for the session. Your settings, saved passage
selections and any saved history belong to the browser and local address you
use. Stick to the same browser and port to keep them handy.

### Find more MIDI files

The discovery script can shortlist classical piano editions to use as melody
sources. Run it from the project folder with your Python environment active.

```sh
python tools/discover_scores.py --composer ChopinFF --limit 8
```

Open `score-shortlists/mutopia.md` for source and licence links. Download a
MIDI file from the source you choose, extract it if necessary, then open it
with **Choose MIDI file**. The script only writes the shortlist. Add
`--include-by-sa-4` to include editions marked CC BY-SA 4.0.

## Troubleshooting

- **The page won’t open.** Check the launcher window for an error and open
  the address it prints. If port 8767 is busy, use
  `python3 launch.py --port 8768` on macOS or Linux, or
  `.\start.cmd --port 8768` in PowerShell. Add `--no-browser` to start the
  server and open the address yourself. After an app update, stop the old
  server before starting again.
- **The instrument doesn’t appear.** Check that it’s switched on and that
  Chrome or Edge has MIDI permission for the local page. Reconnect the cable
  or Bluetooth MIDI port, then click **Refresh MIDI**. For a stuck note, click
  **Clear input**. Keep the practice page focused when you play.
  [Chrome’s MIDI permission guide](https://developer.chrome.com/blog/web-midi-permission-prompt)
- **The staff asks for notes outside your range.** Check **MIDI pitch mapping**
  first, then your learned range and **Reading register**. If you loaded a
  private MIDI file, check **File pitch mapping** and choose its melody track.

Open **Help** at the top of the app for more about the controls. If the
launcher can’t set up Python, try the manual steps below.

<details>
<summary>Manual setup</summary>

From the project folder on **Windows (PowerShell)**, run

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py --port 8767
```

On **macOS or Linux**, run

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py --port 8767
```

Open [http://127.0.0.1:8767](http://127.0.0.1:8767). For later starts, run the
last command again. After an update, rerun the dependency installation command
first. If the launcher reports an incomplete `.venv`, rename that folder and
run the launcher again to create a fresh one.

</details>
