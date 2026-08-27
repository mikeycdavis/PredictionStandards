# Backlog

<!-- GENERATED FILE - do not edit by hand. Re-run the backlog script after changing anything in items/. -->

Work on this project classified with the Extended Agile Hierarchy. Every item is a file in
[`items/`](./items/); its YAML frontmatter is the source of truth and this page is derived from it.

**25 of 26 leaf items complete — 96%**

```
██████████████████████████████████████░░  96%
```

## Status

| Status | Items |
| --- | ---: |
| ◔ Ready | 4 |
| ◑ In progress | 1 |
| ● Complete | 48 |
| **Total** | **53** |

## The hierarchy

| Level | Prefix | Count | Answers |
| --- | --- | ---: | --- |
| Theme | `TH-` | 1 | Which enduring area of value is this? |
| Initiative | `IN-` | 5 | What outcome are we pursuing there? |
| Epic | `EP-` | 7 | What large body of work delivers it? |
| Feature | `FE-` | 14 | What shippable slice of that epic? |
| Story | `ST-` | 26 | What user-visible change, roughly one PR? |
| Task | `TA-` | 0 | What technical step inside a story? |

## Progress by theme

| Theme | Progress | Done | Remaining |
| --- | --- | ---: | ---: |
| [TH-01 Prediction quality governance](./items/TH-01.md) | `█████████████░` 96% | 25 | 1 |

## In flight

- ◑ [TH-01](./items/TH-01.md) — Prediction quality governance

## Ready to pick up

- ◔ [EP-07](./items/EP-07.md) — The version a policy declares, established rather than echoed
- ◔ [FE-14](./items/FE-14.md) — Version-resolution semantics, decided before implementation
- ◔ [IN-05](./items/IN-05.md) — Framework version resolution
- ◔ [ST-26](./items/ST-26.md) — Determine version-resolution semantics and their falsifiers

## Everything

- ◑ **[TH-01](./items/TH-01.md)** Prediction quality governance _(25/26)_
  - ● **[IN-01](./items/IN-01.md)** A self-enforcing prediction standards pack _(1/1)_
    - ● **[EP-01](./items/EP-01.md)** The v1.0.0 standards system _(1/1)_
      - ● **[FE-01](./items/FE-01.md)** Standards catalog, rules, and evaluator _(1/1)_
        - ● **[ST-01](./items/ST-01.md)** Implement the Prediction Standards pack, v1.0.0
  - ● **[IN-02](./items/IN-02.md)** Evidence-driven standards evolution _(5/5)_
    - ● **[EP-02](./items/EP-02.md)** The adoption evidence program _(5/5)_
      - ● **[FE-02](./items/FE-02.md)** Three independent adoptions _(4/4)_
        - ● **[ST-02](./items/ST-02.md)** Adoption #1 - Moneyball
        - ● **[ST-03](./items/ST-03.md)** Adoption #2 - BurnoutPredictor
        - ● **[ST-04](./items/ST-04.md)** Adoption #3 - DeadInternetDetector, and N1 replication
        - ● **[ST-05](./items/ST-05.md)** Cross-adoption synthesis
      - ● **[FE-03](./items/FE-03.md)** v1.1 evidence review and disposition _(1/1)_
        - ● **[ST-06](./items/ST-06.md)** Disposition every adoption finding
  - ● **[IN-03](./items/IN-03.md)** Release v1.1.0 _(7/7)_
    - ● **[EP-03](./items/EP-03.md)** v1.1 implementation and publication _(7/7)_
      - ● **[FE-04](./items/FE-04.md)** The ten accepted candidates, C1-C10 _(4/4)_
        - ● **[ST-07](./items/ST-07.md)** C1 - the ensemble not-applicable reason states only what was observed
        - ● **[ST-08](./items/ST-08.md)** C2 - Standard 19, Outcome Falsifiability
        - ● **[ST-09](./items/ST-09.md)** C3, C4, C5 - the arithmetic and reconciliation corrections
        - ● **[ST-10](./items/ST-10.md)** C6-C10 - the documentation and default corrections
      - ● **[FE-05](./items/FE-05.md)** Post-review defects, classified separately _(2/2)_
        - ● **[ST-11](./items/ST-11.md)** Fix the directory assurance summary to report the run, not one record
        - ● **[ST-12](./items/ST-12.md)** Reference-port cleanup - correct citations to a pack this is not
      - ● **[FE-06](./items/FE-06.md)** Publication of v1.1.0 _(1/1)_
        - ● **[ST-13](./items/ST-13.md)** Freeze, verify from main, and tag v1.1.0
  - ● **[IN-04](./items/IN-04.md)** Machine-consumable enforcement _(12/12)_
    - ● **[EP-04](./items/EP-04.md)** A verified pipeline and a verified submission path _(4/4)_
      - ● **[FE-07](./items/FE-07.md)** The pipeline defined once and containerised _(4/4)_
        - ● **[ST-14](./items/ST-14.md)** The pipeline defined once, in scripts/ci.mjs
        - ● **[ST-15](./items/ST-15.md)** Run the pipeline in an ephemeral, read-only, networkless container
        - ● **[ST-16](./items/ST-16.md)** Submission that can only carry a verified commit
        - ● **[ST-17](./items/ST-17.md)** Defects the hosted runner found that the local run could not
    - ● **[EP-05](./items/EP-05.md)** A verdict an external enforcer can read _(4/4)_
      - ● **[FE-08](./items/FE-08.md)** The aggregate status _(1/1)_
        - ● **[ST-18](./items/ST-18.md)** One authoritative disposition over a checked set
      - ● **[FE-09](./items/FE-09.md)** The adapter declaration, and a verdict that arrives whole _(2/2)_
        - ● **[ST-19](./items/ST-19.md)** Declare how this pack is invoked
        - ● **[ST-20](./items/ST-20.md)** A verdict that arrives in two pieces is not a verdict
      - ● **[FE-10](./items/FE-10.md)** The report envelope contract _(1/1)_
        - ● **[ST-21](./items/ST-21.md)** A report envelope contract that can be checked
    - ● **[EP-06](./items/EP-06.md)** Publication of 1.2.0 _(4/4)_
      - ● **[FE-11](./items/FE-11.md)** Release identity, measured before it was moved _(2/2)_
        - ● **[ST-22](./items/ST-22.md)** What the release is worth, and what the policy's standardVersion means
        - ● **[ST-23](./items/ST-23.md)** Release identity 1.2.0, and a README that can no longer drift from it
      - ● **[FE-12](./items/FE-12.md)** Post-review defects, classified separately _(1/1)_
        - ● **[ST-24](./items/ST-24.md)** An accepted instant that broke the schema, and a verdict that depended on spelling
      - ● **[FE-13](./items/FE-13.md)** Freeze, verify from main, and tag v1.2.0 _(1/1)_
        - ● **[ST-25](./items/ST-25.md)** Freeze, verify from main, and tag v1.2.0
  - ◔ **[IN-05](./items/IN-05.md)** Framework version resolution _(0/1)_
    - ◔ **[EP-07](./items/EP-07.md)** The version a policy declares, established rather than echoed _(0/1)_
      - ◔ **[FE-14](./items/FE-14.md)** Version-resolution semantics, decided before implementation _(0/1)_
        - ◔ **[ST-26](./items/ST-26.md)** Determine version-resolution semantics and their falsifiers

