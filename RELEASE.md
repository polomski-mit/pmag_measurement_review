# Release and hosting

Version: 0.1.0.

This repository is the standalone distribution of Measurement Review. Python
3.10+ runs the CLI without dependencies. Open `index.html` for the offline
viewer and invented demonstration; static hosting requires no build.

## Development

Edit Python code in `lib/` and viewer templates in `lib/templates/`.
Regenerate the public viewer after changing templates or application code:

```sh
python3 lib/build_quality_review.py --public --out index.html
python3 -m unittest discover -s tests -v
node tests/test_viewer.js
```

Node is needed only for the viewer test. Before releasing, confirm the viewer
contains only synthetic data, and exclude generated review bundles, decisions,
local galleries, and scientific measurements from any archive.

Screening thresholds are heuristics, not a validated classifier. All proposals
require human review. Saved-fit recalculation and instrument axis calibration
remain the researcher's responsibility.
