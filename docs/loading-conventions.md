# RAPID loading convention

The standard Caltech RAPID/Paleomag Up/Down correction is the reviewer's **X-axis half-turn**: `(X, Y, Z) → (X, −Y, −Z)`, or `D → −D mod 360°`, `I → −I`. Moment is preserved.

This is the correction for an opposite Up/Down loading declaration. Dana's two photos show opposite top faces with the side-arrow reference still toward the finger, consistent with the intended Up/Down turnover. The mathematical identification comes from the acquisition code, rather than assuming the arrow's axis from the photographs.

## Primary-source verification

Downloaded 2026-11-07 from the [original RAPID SourceForge CVS archive](https://sourceforge.net/code-snapshots/cvs/p/pa/paleomag.zip), linked by the project's [Code page](https://sourceforge.net/p/paleomag/code/).

Inspected `paleomag/paleomag2007/MeasurementBlock.cls,v`, head revision 1.1, dated 2007-02-13, log “Paleomag 2007, v. 2.4.0”. The 2006 release contains the same sign convention.

- `isUp` sets `mvarDirection` to +1 for Up and −1 for Down.
- In `CorrectedSample`, each of the four rotation positions multiplies corrected Y and Z by `mvarDirection`; corrected X is independent of it.
- Therefore changing only the Up/Down declaration reverses Y and Z, preserving X.
- `modMeasure.bas` assigns `readDats.Last.isUp = isUp` before averaging/unfolding.

The bundled 2006 manual (`Help/index.html,v`, updated 20 June 2006) describes measuring Up and Down and prompting the operator to turn samples over. [Kirschvink et al. (2008), doi:10.1029/2007GC001856](https://doi.org/10.1029/2007GC001856) describes the Visual Basic acquisition and averaging of rotation-corrected Up/Down measurements.

## Other option and limits

The Y-axis alternative maps `(X, Y, Z) → (−X, Y, −Z)`: `D → 180°−D`, `I → −I`. It represents another possible misorientation, not RAPID's standard Up/Down correction.

This establishes the released code's convention, not the exact version or modifications installed in a particular lab. Correctly declared Down measurements have already received the correction; do not apply it twice. Neither geometric agreement nor this documentation establishes that a particular observation was misloaded. All corrections still require review.
