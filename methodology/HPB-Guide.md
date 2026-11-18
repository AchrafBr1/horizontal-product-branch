# The HPB Guide — version 1.0

**Horizontal Product Branch: the definitive, short guide to planning and tracing product evolution
across hardware, firmware and software.**

Achraf Bouchtarouif El Khiat · November 2026 · Licensed under [CC BY 4.0](../LICENSE-CC-BY-4.0.md)

This guide is the short, normative form of HPB 1.0. It is distilled from the paper
*Horizontal Product Branch (HPB): A Practitioner's Methodology for Planning and Tracing Product
Evolution across Hardware, Firmware and Software*
([PDF](../paper/HPB-v1.0.pdf), DOI [10.5281/zenodo.24355435](https://doi.org/10.5281/zenodo.24355435)).
Where the two differ in wording, the paper (Section 3, the quick-reference card and the formal
model of Appendix A) is authoritative.

---

## 1. Purpose

HPB exists to answer, by looking at one picture, the questions a product manager is asked every
week and usually cannot answer from backlogs, boards and roadmaps:

- **From which version did this work start?** For a defect: in which version was it seen?
- **What else is running on the same product right now?**
- **Which release actually closed it**, or why was it dropped?
- **Where did this reference come from**, and what moved to it from its parent?

Software teams answer these questions for code with branch-and-merge. HPB applies branch-and-merge
to the **product**, not to the code. It is a product-level view: it does not schedule engineers or
replace team boards. It sits above them and records from which product state work started, which
version closed it, and what else was in flight at the same time.

HPB is deliberately small. Every concept in it had to earn its place by answering a question I was
asked in a real product review and could not answer with the tools I had.

## 2. Definitions

**Product line.** One product reference followed over time: a device model with its manufacturer
reference, a firmware, an application or a service. In HPB a line is *one* reference and its
history, not a family of variants. Lines are related by descent; the portfolio is the resulting
family tree of references.

**Baseline.** A named, identifiable state of a line (`v2.3.1`, `Rev B`, `PC-7`), in the
configuration-management sense. Every baseline has a **kind** (firmware, software, hardware, or
other for a *process baseline*: a change to manufacturing, test procedure or supplier), a
**status** (*planned*, a target with a date, or *released*, a fact with a date) and a name unique
in its line. Status only moves from planned to released. **A released baseline is immutable.**

**Released.** Firmware and software: the build is published to customers. Hardware: the
engineering change order is approved *and* its production effectivity is recorded. Process: the
change becomes effective in production. You may define it differently, but write it down.

**Main line.** The ordered baselines of a line's main stream, drawn as the thick horizontal
stroke. A line may also have **maintenance streams** that leave a released baseline (for example a
long-term-support firmware). A stream never changes the product reference.

**Branch.** One unit of change intent on a product. It is *not* a code branch: one HPB branch may be
implemented by many commits, a lab campaign or a hardware redesign. A branch is a
*release-note-worthy unit of change*. Every branch has exactly one **type**:

| Type | Name | What it is | Side of the main line |
| --- | --- | --- | --- |
| **I** | Improvement | A change that makes the product better for users (customers, sales, competitor analysis, roadmap). | Above (lane +1) |
| **L** | Laboratory evolution | Evaluation or qualification of a new component, design or technology. | Above (lane +2) |
| **X** | Issue | A defect observed in a released baseline. | Below (lane −1) |
| **T** | Task | Engineering or operational work that keeps the product correct and operable (certification renewal, last-time buy). | Below (lane −2) |

**Fork.** The start of a branch. Its **fork baseline** is the one released baseline it starts from,
fixed when the request is accepted at triage. For an issue, it is the version in which the defect
was *observed*; for the other types, the version the change is specified against (by default the
latest release of the main stream). The fork baseline is never rewritten by what is learned later:
other affected versions go to an *also affects* list, the version that introduced the defect is
recorded separately, and an inferred origin is flagged as such.

**Step.** What happens inside a branch: a short, time-ordered list of *done*, *to do*, *test passed*
or *test failed*, each optionally with evidence. Sub-tasks and test runs are steps, never branches.

**Branch states.** *Open* (accepted, not committed to a version); *targeted* (committed to a planned
baseline, its target; re-targeting stays visible); *merged*; *discarded*. Merged and discarded are
final; a reopen is an exceptional, audited operation.

**Merge.** The closure of a targeted branch by the publication of its target baseline. The set of
branches a baseline merged *is* its change log. A targeted branch is **verified** when it has a
passed test step whose evidence identifies a candidate of its target (release-candidate build,
prototype, pilot lot).

**Discard.** The closure of a branch without a baseline, always with a written rationale from one of
two classes: *abandoned* (not viable, duplicate, cannot reproduce, superseded, out of scope, will not
fix) or *resolved without a product baseline* (already resolved in an existing version, contained
without design change, resolved by the supplier). A defect solved by changing *how* the product is
built is not discarded; it is merged into a process baseline.

**Line fork.** A hardware baseline that creates a new reference because the revised unit is **not
interchangeable in form, fit or function** with the previous one. The hardware baseline is the first
baseline of the new line, which keeps a permanent link to its parent line and parent baseline. Later
versions of the parent do not contain the work that created the child, and fixes made on the parent
after the fork are not in the child unless carried over explicitly. An interchangeable change is
simply a hardware baseline on the existing line.

**Release gate.** Every planned baseline is a gate. Its **targeted set** is the set of branches
currently committed to it. Publishing the baseline releases it and merges every branch of the
targeted set in one operation.

**Optional relations.** A *dependency* (a branch can only be delivered with or after another branch
or baseline), a *propagation* (a branch carries another branch's change to a different stream or
line: a back-port or forward-port) and a *launch bundle* (planned baselines of different lines
published together or not at all). A change that must reach several versions is one branch per
target, linked by propagations.

**Life cycle.** Every line has up to four dated milestones: end of sale, end of production, start of
security-only maintenance and end of service. They define which work a reference still accepts.

## 3. The seven rules

HPB is defined by seven rules. Each one closes a specific hole I kept falling into.

**R1 — Single origin.** Every branch forks from exactly one released baseline, fixed when the work
is accepted. For a defect, that is the version where it was seen.
*Why:* without it, "relative to which version?" has no answer, and you cannot tell in which version a
defect escaped.

**R2 — Explicit closure.** Every closed branch ends in exactly one way: merged into one baseline, or
discarded with a written reason. Nothing is closed silently.
*Why:* "closed" with no version and no reason is the most common way traceability is lost.

**R3 — Time moves forward.** A branch merges only into a baseline that comes after its origin, on
the same line or a descendant of it.
*Why:* a version cannot contain work requested after it was frozen, so change logs contain only what
really went in.

**R4 — Gate integrity.** A planned version is released only when every branch committed to it has
passed verification against a candidate of that version, and everything it depends on is released
too. Work that is not ready is re-targeted or discarded, explicitly.
*Why:* it stops the most expensive habit in product work, shipping a version while committed work is
quietly still pending.

**R5 — Lineage and life cycle.** A hardware change that is not interchangeable in form, fit or
function creates a new line with a permanent link to its parent; references are never edited in
place, and a retired reference does not accumulate new work.
*Why:* units already in the field keep their history, and you always know what to maintain and for
how long.

**R6 — Typed work.** Every branch has one type; sub-tasks and test runs are steps of a branch, not
branches of their own.
*Why:* otherwise the same piece of work is counted twice, and the metrics lie.

**R7 — Traceable discussion.** Every comment, decision or piece of evidence is attached to one
element of the graph (a line, a baseline or a branch), and the record is append-only.
*Why:* decisions made in chat threads and meetings cannot be audited; attached to the branch they
concern, they are found exactly where the diagram is read.

With these rules in place, the documents a product manager usually compiles by hand become queries
on the graph: the **change log** of a version (the branches it closed), **escaped defects** (each
issue belongs to the one version where it was seen), **work in progress** (open and targeted
branches, by type) and **lineage** ("is this fix in that version?" always has a yes-or-no answer).

## 4. The notation

A methodology spreads when people can draw it on a whiteboard and others read the drawing the same
way. The HPB notation is therefore fixed.

**Canvas and reading order.** Time runs left to right. Lane 0 is the main line, a thick dark stroke
that *is* the product. Branches run on the lane of their type: **I** at +1 and **L** at +2 above the
line; **X** at −1 and **T** at −2 below it. Read every HPB diagram the same way: *above the line, how
the product gets better; below it, what is wrong and how it is fixed; left of NOW, history, which
does not change; right of NOW, the plan, which is expected to change.* Left of the NOW marker all
strokes are solid; right of it, dashed.

**Ordinal time.** By default every event (release, branch start, step, terminal) gets its own column
of equal width, in time order; calendar months appear only as ticks below the diagram. Horizontal
length is therefore *not* duration. A linear (calendar) axis is allowed when the distance to a date
is the message, and must be stated in the caption.

**Core glyphs.**

| Glyph | Element |
| --- | --- |
| Thick line, solid then dashed | Main line: history, then plan |
| Dot at the left end, with a product box | Line origin (creation of the reference, not a version) |
| Filled circle with a tag | Released baseline |
| White circle, dashed, with a target date | Planned baseline and gate; `!` badge and red tag when overdue |
| Diamond | Hardware baseline; with *new ref.*, the first baseline of a forked line |
| Square | Process baseline |
| Lettered start node (I, L, X, T) | Opening of a branch |
| Path rejoining the line | Merge terminal |
| Gray path ending in a cross, with rationale | Discard terminal |
| Hollow head on the NOW marker | Open branch |
| Dashed continuation into a planned baseline | Targeted branch (faded old target when re-targeted) |
| Band around the dashed continuations entering a planned baseline | Gate band: the targeted set of that gate; every continuation entering it must be verified before the version ships |
| Check, cross, filled or hollow node on a branch | Steps: passed, failed, done, to do |
| Dashed vertical labeled NOW | The present moment |
| Bar labeled EoS | End of service of a retired line |

**Never color alone.** Every category is encoded at least twice: branch type by lane, letter, legend
and color; state by terminal shape, line style and position relative to NOW; baseline kind by shape
and tag color. Diagrams must survive grayscale printing and color-vision deficiency.

**Layout rules.** A diagram *conforms* when it uses these glyphs and follows the ten layout rules
L1–L10 of the paper (Section 5.5): ordinal columns, fixed lanes, one branch per lane at a time, clean
verticals, one tag per baseline, label placement, exactly one terminal per branch, history not
redrawn, one lane band per line or stream, and legibility after scaling.

**From text.** HPB Markup draws conforming diagrams from a few lines of text, and checks the rules
that text can decide (R1–R3 in full, R4 as an open-branch release gate, R5–R7 in part; see the [language reference, §4](../docs/language.md#rules)). Statement order is time order:

```hpb
hpb "Planning with a release gate"
line A "Product A"
release v2.0 @2027-01
issue X-210 "Sync error"
improvement I-50 "Multi-user access"
issue X-213 "Display flicker"
release v2.0.1 @2027-02 merges X-210
issue X-211 "Report totals"
issue X-212 "CSV encoding"
step X-212 pass "verified"
step I-50 done "implemented"
now
plan v2.1 @2027-05 targets I-50, X-211, X-212
plan v2.2 @2027-09
```

Here v2.1 is a gate: it cannot be released while I-50 or X-211 is unverified (R4), and X-213 is open
but not committed to any version. HPB Markup checks the open-branch part of this gate only: it
blocks `release v2.1` while any branch targeting v2.1 is open, and it does not read verification
evidence (see the [language reference, §4](../docs/language.md#rules)). The language is specified in the
[HPB Markup language reference](../docs/language.md).

## 5. Practices, cadence and roles

HPB prescribes **what must be recorded at each decision**. How engineering organizes its own work
stays with whatever team process is already in place.

### Four principles

- **M1 Record at the decision, not after it.** Every change to the graph matches a decision that is
  already being taken. The graph is a by-product of deciding, not an extra reporting duty.
- **M2 One accountable owner per node.** Every line, baseline and branch has exactly one accountable
  role.
- **M3 Closure is explicit and evidenced.** A branch merges into a named baseline or is discarded
  with a written reason. Nothing disappears.
- **M4 History is fixed, the plan is not.** Left of NOW is corrected only through audited events;
  right of NOW is expected to change. Plan changes should be cheap; history changes should be
  visible.

### Practices

| Practice | Trigger | Accountable | Enforces | Leaves in the graph |
| --- | --- | --- | --- | --- |
| Fork at intake | A request, defect, task, lab evaluation or supplier notice is accepted at triage | PM | R1, R6 | Typed branch with origin baseline, opening date, owner |
| Target at planning | Release planning; a priority change | PM | R4, R7 | Target; earlier targets kept as history |
| Verify | A candidate of the target is tested | QA | R4, R7 | Pass/fail step citing the candidate |
| Gate review | Freeze or target date of a planned baseline | Release manager | R4 | Release, slip with new date and reason, or descope |
| Merge at release | The baseline is published | Release manager | R2, R3 | Merge of every verified member; release notes derived |
| Discard with reason | Not viable, duplicate, superseded, out of scope; or resolved without a product baseline | PM | R2, R7 | Discard with reason class and text |
| Reopen (audited) | A closure was recorded in error | PM + second approver | R2, R7 | Reopen event; original terminal kept |
| Line fork | A hardware change fails the interchangeability test | Change control board | R5 | Diamond baseline, child line with parent link, parent life-cycle milestones |
| Record step | A sub-task completes, a test runs, an effectiveness check is made | Eng or QA | R6, R7 | Step with evidence |

**Intake and typing.** A request becomes a branch only when accepted at triage, with its type, its
origin and its opening date. For an issue the origin is mandatory; if nobody knows it, clarify first
or flag it as *inferred*. Security, regulatory relevance, safety or a specific customer are
*attributes* of a branch, not extra types. User stories, sub-tickets and commits stay on team boards
and may appear as steps. Publish your intake convention with your diagrams.

**Gate review.** Each targeted member is verified, not yet verified, or no longer wanted; each
dependency is satisfied or not. The review ends in one of three recorded outcomes: **release**,
**slip** (new date and reason) or **descope** (move or discard the unverified members). The rule
does not choose for you; it forces the choice to be made and written down.

### Cadence

Practices are event-driven, but most events land in four recurring meetings. Adapt the frequencies;
keep the order.

1. **Weekly triage (30–45 min).** Fork at intake; discard obvious duplicates. Read below the line
   first: new issues and their origins often reveal a bad release early. End with open, untargeted
   branches older than an agreed threshold.
2. **Release planning (per planned version).** Target at planning, with a size check against what
   recent releases actually contained and a dependency check.
3. **Gate review (at freeze or target date).** Then merge at release if the decision is to ship. The
   dashed lines entering the gate without a passed step are, by construction, the open questions.
4. **Line review (monthly or after each release).** Release contents, escaped defects, unported
   fixes, metrics; decisions on life-cycle milestones, patches and ports.

### Roles

HPB introduces no new job titles.

- **Product manager**: owns product lines and the content of planned versions (triage, typing,
  targeting, discards).
- **Release or program manager**: owns dates and gates; runs the gate review and publishes versions.
- **Change control board**: approves change orders, hence hardware baselines and line forks.
- **R&D / engineering**: owns improvement and task branches once accepted, and records their steps.
- **Quality / laboratory**: owns lab branches and verification evidence; consulted at every gate;
  approves discards of safety- or regulation-relevant issues.
- **Support and field service**: main source of issues; owns the quality of the reported version
  and configuration.

In a small organization one person wears several hats, as long as the role behind each action is
visible. Two segregations of duty remain: reopens and safety- or regulation-relevant discards need a
second approver.

### Living with other frameworks

A Scrum sprint is a team time-box, **not** a baseline; an increment becomes a baseline only when it
is released to customers. A Kanban card is a branch or a step of one; "done" becomes a merge only
when the closing version is published. A Stage-Gate *kill* is a discard with reason; Stage-Gate
gates decide whether to keep investing, HPB gates decide whether a release is complete. A released
HPB baseline references the PLM change order or configuration baseline that formally defines it.
HPB does not replace configuration management or a PLM change process.

### Anti-patterns

Silent closure (no terminal, breaks R2) · eternal branch (an untargeted branch outliving releases) ·
gate stuffing (a targeted set much larger than recent releases) · floating evidence (breaks R7) ·
in-place reference edit (breaks R5) · unported fix (no port and no decision not to port) · shipping
ahead of a dependency (blocked by R4).

## 6. Adoption path: start on Monday

HPB needs no migration and no new tool on day one.

- **Week 1: one line, drawn by hand.** Pick *one* product line with parallel work and a release
  coming up. Write down its last three to five released versions and where the line came from. For
  each release-note-worthy open item in your trackers, record its type and its best-known origin,
  marking guesses as *inferred*. Create the next planned version and target what is already promised
  for it. Draw it (whiteboard, `hpb.sty` or HPB Markup) and show it at your next triage.
- **Month 1: run the cadence.** No branch without a type and an origin. Run weekly triage on the
  diagram, issues first. Run the first gate review and record its outcome. When the version ships,
  merge its verified branches: from then on, release notes are generated, not written.
- **Quarter 1: extend and measure.** Add the next lines, with their hardware revisions, line forks
  and maintained streams. Set life-cycle milestones for every old reference still maintained. Hold
  the first line review with metrics, and connect HPB to your tracker so the diagram is generated
  from the items.

## 7. What is normative and what is optional

**Normative in HPB 1.0:** the idea (Section 1 of this guide), the four branch types, the seven rules
R1–R7 and the notation (glyphs, lanes, reading order, never color alone). In the paper, Section 3
together with the quick-reference card is the normative definition; the formal model in Appendix A
states the same rules precisely.

**Recommended, adapt to your organization:** the default definition of *released* per kind (you may
redefine it, in writing), the intake and typing convention, the practices, the cadence and its
frequencies, the role mapping, the adoption path and the metrics.

**Optional:** maintenance streams (used when needed), the three relations (dependencies,
propagations, launch bundles), the deployment overlay (rollout, installed base, customer
commitments), the linear time axis, and any tooling, including HPB Markup.

**Versioning of the method.** HPB changes only through versioned releases: **HPB 1.x** for additions
that keep every existing diagram valid, a new major version for anything that would not.

## 8. License

The HPB Guide, the text of the method and its notation are licensed under the
**Creative Commons Attribution 4.0 International License (CC BY 4.0)**: you may copy, translate and
adapt them, for any purpose, as long as you give appropriate credit, link to the license and say if
you made changes. See [LICENSE-CC-BY-4.0.md](../LICENSE-CC-BY-4.0.md). The LaTeX package `hpb.sty`
and the HPB Markup toolkit are released under the [MIT License](../LICENSE).

## 9. How to cite

> Bouchtarouif El Khiat, A. (2026). *Horizontal Product Branch (HPB): A Practitioner's Methodology
> for Planning and Tracing Product Evolution across Hardware, Firmware and Software* (Preprint
> v1.0). Zenodo. https://doi.org/10.5281/zenodo.24355435

BibTeX and the machine-readable [CITATION.cff](../CITATION.cff) are in the
[repository README](../README.md#how-to-cite).

---

*The HPB Guide 1.0 · © 2026 Achraf Bouchtarouif El Khiat · CC BY 4.0 ·
<https://github.com/AchrafBr1/hpb>*
