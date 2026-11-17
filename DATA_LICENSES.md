# Data licenses

The source code in this repository is released under the [MIT License](LICENSE).
The datasets in `backend/data/` are **not** covered by it: two of them are derived
from third-party databases and keep their original licenses, listed below.

| File | Source | License |
|---|---|---|
| `backend/data/ciqual_es.json` | ANSES — Ciqual 2020 food composition table | Licence Ouverte / Open Licence 2.0 (Etalab) |
| `backend/data/off_supermercados.json` | Open Food Facts | ODbL 1.0 (database), DbCL 1.0 (contents) |
| `backend/data/raciones.json` | Written for this project | MIT, like the code |

## Ciqual (ANSES)

`backend/data/ciqual_es.json` is derived from:

> ANSES. 2020. *Table de composition nutritionnelle des aliments Ciqual*.
> <https://ciqual.anses.fr>

Reused under the [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).

**Modified.** The file holds the Spanish translation of the 3,185 food names, with
search aliases. At import time `backend/scripts/import_ciqual.py` also normalizes the
nutrient values (rules and reasoning in `backend/scripts/ciqual_rules.md`). ANSES has
not reviewed or endorsed these changes. The original `.xls` is not redistributed:
`import_ciqual --download` fetches it from ANSES.

## Open Food Facts

`backend/data/off_supermercados.json` is an extract of 12,988 packaged products
(code, name, brands, quantity, nutrients per 100 g) from the
[Open Food Facts](https://world.openfoodfacts.org) database. Product images are not
included.

> Contains information from Open Food Facts, which is made available here under the
> [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
> Individual contents are under the
> [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).

**Share-alike:** as a derivative database, this file is distributed under the
**ODbL 1.0**, not under MIT. You may use, share and adapt it on the same terms,
provided you keep this attribution.

The app also reads Open Food Facts live: scanning a barcode queries its public API
(`backend/app/openfoodfacts.py`). The app credits both sources at the bottom of
the profile screen.
