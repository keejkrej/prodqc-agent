# SYNTHETIC FIXTURE — not a real lab protocol. Do not use for production.

Protocol family: lnp_microfluidic
Product line: lnp_formulation
Version: 1.1.0
Title: SYNTHETIC microfluidic LNP mixing SOP v2 (2025-01)

## Materials
- SYNTHETIC ionizable lipid (role: ionizable_lipid)
- SYNTHETIC DSPC (role: helper_lipid)
- SYNTHETIC cholesterol (role: cholesterol)
- SYNTHETIC PEG-lipid (role: peg_lipid)
- SYNTHETIC mRNA payload (role: nucleic_acid_payload)

## Formulation
- N/P ratio: 6
- Total flow rate: 12 mL/min
- Flow rate ratio aqueous:organic: 3:1
- Lipid molar percent ionizable_lipid: 50 %
- Lipid molar percent helper_dspc: 10 %
- Lipid molar percent cholesterol: 38.5 %
- Lipid molar percent peg_lipid: 1.5 %

## Process
1. Microfluidic mix
Mix the aqueous and organic streams on the microfluidic mixer.
Continue until the suspension is clear.
Do not replace the clarity gate with a single fixed mix time.
If still cloudy after 20 min, remake the batch.

2. DLS t0
Measure Z-average size and PDI at 25 deg C.
PDI specification: maximum 0.20

3. RiboGreen encapsulation
Measure encapsulation efficiency.
Encapsulation target: 90 %

4. DLS t+24 h
Hold 24 h then measure Z-average.
Size drift specification: maximum 5 nm

## QC
- Z-average range: 70-140 nm
