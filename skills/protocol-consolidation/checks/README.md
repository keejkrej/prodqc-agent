# Shared checks library

`checks/<assay-type>.md` is the versioned, generic checklist. Labs may share these files. They must not put real protocol text here.

| File | Assay class |
| --- | --- |
| `_template.md` | Copy via proposed diff when adding a type |
| `ribogreen-ee.md` | RiboGreen-style encapsulation efficiency |
| `CHANGELOG.md` | Accepted additions only |

New checks enter through `runs/<run-id>/proposed-checks/*.diff` and human approval. A receiving lab adopts a proposal only when its owner signs off. See [../references/self-improvement.md](../references/self-improvement.md) and [docs/cross-lab-loop.md](../../../docs/cross-lab-loop.md).
