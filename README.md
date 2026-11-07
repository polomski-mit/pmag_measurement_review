# Measurement Review

A local, keyboard-driven reviewer for thermal paleomagnetic MagIC measurements.
Approve or reject proposed exclusions, loading flips, and reciprocal specimen
swaps with moment, equal-area, Zijderveld, and CSD plots alongside each case.
Each bulleted reason includes an explanation using its evidence. A guide
below the plots introduces vector projections, moment, and interpretation
of the Zijderveld plot.

## Quick start

Clone this repository or download its source ZIP. Python 3.10+ is required to scan your
data; there are no Python packages, JavaScript packages, accounts, or API keys
to install. Open the supplied `index.html` to try the invented demonstration.

```sh
python3 review.py --input /path/to/magic_folder --output /path/to/review_work
```

Open `review_work/review.html` directly, or load `review_work/review.bundle.json`
into a hosted copy of `index.html`. Arrow keys move between cases; **Y** approves,
**N** rejects, **U** defers. A confirmation dialog follows each choice: **Enter**
saves it and advances to the next measurement; **Esc** returns to reassess
without changing the decision. Confirmed decisions and notes autosave in this
browser and restore on reopening the same review bundle. Browser storage can
be cleared or unavailable, so click **Save decisions** regularly to download
`measurement_transformations.reviewed.json`.

```sh
python3 review.py --input /path/to/magic_folder --output /path/to/review_work \
  --decisions /path/to/measurement_transformations.reviewed.json
```

Only approved actions affect `review_work/derived/<dataset>/measurements.txt`.
Removed rows, rules, source hashes, and applied actions are audited alongside
it. Canonical measurements and CIT inputs stay untouched. These outputs are
measurement inputs: reload/recalculate saved interpretations against them.

Rerun the first command after replacing input data. Decisions persist by
**specimen + ISO timestamp**, independent of regenerated measurement IDs. Changed
scientific values at the same identity require review again. New findings remain
pending. Rejecting an exclusion records a keep override. Conflicting approved
transformations stop application rather than choosing one silently.

Use the **Dark mode / Light mode** button to change the interface and plot
palette. The viewer remembers your choice locally and initially follows your
system preference.

Warnings use red for high CSD, orange for moderate scatter, magenta for
low-moment proposals, purple for orientation/identity hypotheses, and blue
for existing source flags. Low-moment evidence includes its log₁₀ drop;
≤0.1% of reference is labeled very low. Each reason has a text label;
colors describe review priority, not error probability or acceptance status.

Plots default to **After confirmed review**: approved exclusions and outgoing
swap observations remain faded red with disconnected trajectories. Confirmed
flips and incoming swap observations appear teal; faint original flip vectors
remain visible. Rejected proposals retain the original observation, and pending
proposals do not change the series. A teal preview for the current pending
flip/swap is only a hypothesis. Switch to **Before review** to compare recorded
data. Trajectories follow treatment temperature (repeats by time), with gaps at
excluded treatments even across repeats. Exclusions use faded red crosses.
The enlarged Zijderveld panel uses filled horizontal circles and open vertical
squares, colored from cool to hot treatment. Choose X–Y / X–(−Z) or Y–X /
Y–(−Z), and full trajectory or nearby context. Axes are specimen coordinates,
not geographic north/east. All four plots update after confirmation or loading saved decisions;
these are browser previews, not writes to your input tables. Conflicting
approved actions are withheld from affected observations and shown as a warning.

## Input and screening rules

Input is a MagIC 3 `measurements.txt`, starting `tab<TAB>measurements`, with
`specimen`, `timestamp`, `measurement`, `treat_temp` (K), `dir_dec`, `dir_inc`,
`magn_moment` (A·m²), `dir_csd` (degrees), and `quality`. Directions must be in
specimen coordinates; timestamps identify individual observations and must be
unique within each specimen. This release supports thermal directional data;
AF and paleointensity experiments are not supported. Missing values or ambiguous
identities produce an error rather than a guessed exclusion.

- Existing bad flags and all CSD >4° readings enter the review queue as
  exclusion proposals, never automatic deletions. CSD >4° to 10° is orange;
  CSD >10° is red. Reasons appear as bullet points.
- Low moment: ≤1% of a reliable same-temperature repeat or a log-interpolated
  baseline between nearby temperatures (±25 K). References must be good and
  agree in moment within a factor of three. A terminal intensity decline alone
  is insufficient.
- Flips: conditional 180° rotations around specimen X or Y must improve local
  directional agreement by ≥30° and leave a residual ≤20°.
- Swaps: adjacent specimen numbers within the same site prefix, ≤30 minutes
  apart at the same temperature; exchanging observations must improve **both**
  specimens by ≥30°, with residuals ≤20°. References must agree within 30°.

Thresholds are editable in `transformations.json` under `rules`; these are
screening heuristics, not calibrated error probabilities. Low moments do not
prove that a specimen was dropped. Physical loading-axis definitions must be
checked before accepting a flip. Swap searches deliberately miss some errors
outside the specified neighborhood. Review plots retain magnetic hemisphere
conventions separately from loading declarations. New ledgers use K−273.15 for
display; edit `rules.kelvin_offset` if the source uses a legacy offset.

## Privacy, hosting, and reuse

The public `index.html` contains only application code and synthetic data.
There are no network calls, telemetry, CDNs, or remote models; a restrictive
content security policy blocks connections. Local files are read only after
you select them. Browser caching is convenient, but download decisions regularly.
**Review bundles and generated offline galleries contain your measurements**;
share them only intentionally.

Host `index.html` and this README on any static host, or email the ZIP. No server
or build is required for the viewer. Research datasets are not included. The
tool code is MIT licensed. This license does not cover user-supplied research
data. See `LICENSE`. The plotting draft used local Ollama;
the reviewed application runs deterministic Python/JavaScript without a model.

Run `python3 -m unittest discover -s tests` for the packaged checks. See
`RELEASE.md` for reproducible packaging and deployment notes.
