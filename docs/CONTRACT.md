# The `progress.json` contract

Every unit on the OE Progress Board — an agent or a project — publishes one file, `progress.json`,
at the root of its repository. The board reads it, validates it and renders one card from it. This
document is the contract that file must honour. The executable form of the same contract is
`scripts/validate.mjs` in the board repository; when the two disagree, the validator wins and this
document is wrong.

**Schema version: `1`.** A breaking change bumps it to `2`, the validator accepts both for one
transition window, and this document records what changed.

## The document

```json
{
  "schema_version": "1",
  "slug": "agent-ugc",
  "name": "UGC Agent",
  "kind": "agent",
  "public_summary": "Turns a product brief into ready-to-post creator videos.",
  "stages": [
    { "id": "conceptualization", "state": "done", "date": "2026-06-14" },
    { "id": "planning",          "state": "done", "date": "2026-06-20" },
    { "id": "planning_audit",    "state": "done", "date": "2026-06-22" },
    { "id": "building",          "state": "in_progress", "note": "Half the task bundle is closed." },
    { "id": "building_audit",    "state": "pending" },
    { "id": "testing",           "state": "pending" },
    { "id": "deployment",        "state": "pending" }
  ],
  "building": { "done": 5, "total": 10 },
  "features_built": ["Writes a shot list from a brief", "Picks a creator voice"],
  "features_pending": ["Renders the final cut", "Publishes to the content calendar"],
  "updated_at": "2026-08-28",
  "source_commit": "a1b2c3d"
}
```

## Fields

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `schema_version` | string | required, exactly `"1"` | Bumped only by a contract change, so an old writer fails loudly |
| `slug` | string | required, equals the board manifest's slug for this unit | The join key |
| `name` | string | required, non-empty | Card title, e.g. `UGC Agent` |
| `kind` | string | required, `agent` or `project` | The card's kind label |
| `public_summary` | string | required, one sentence, English | Card subtitle, written for a stakeholder |
| `stages` | array | required, exactly 7 entries in the fixed order | The stepper |
| `stages[].id` | string | required, the 7 ids in order | See "The seven stages" |
| `stages[].state` | string | required, one of the four states | See "The four states" |
| `stages[].date` | string | required when state is `done` or `blocked`, `YYYY-MM-DD` | The day that state was reached |
| `stages[].note` | string | optional | One short public-safe clause under the stage label |
| `building` | object or `null` | required; `null` when the unit has no task bundle | `{ "done": int, "total": int }` |
| `building.done` | integer | 0 or more, and not more than `building.total` | Count of tasks with `status` `done` across the unit's `blueprints/*/tasks.json` |
| `building.total` | integer | 0 or more | Total task count across the same files |
| `features_built` | string[] | required, may be empty | Plain language, 12 words or fewer per item — "Already does" |
| `features_pending` | string[] | required, may be empty | Same style — "Still to build" |
| `updated_at` | string | required, `YYYY-MM-DD` | The day the report was written; more than 14 days old renders as Stale |
| `source_commit` | string | required, 7 to 40 lowercase hexadecimal characters | The commit the report describes |

## The seven stages

Always all seven, always in this order, even before a stage starts. Six or eight entries, or a
different order, is invalid.

1. `conceptualization`
2. `planning`
3. `planning_audit`
4. `building`
5. `building_audit`
6. `testing`
7. `deployment`

## The four states

`pending` · `in_progress` · `done` · `blocked`. Nothing else.

## The state-sequence rule

Joining the seven states in order must match `^(done)*(in_progress|blocked)?(pending)*$`: completed
stages first, then at most one stage that is `in_progress` or `blocked`, then only `pending` stages.
A `done` stage after a `pending` one is invalid, and so are two stages in progress at once.

## Validation rules, in the order they are checked

The rule name is the contract: the validator returns it, the command line prints it, and the board
shows it on a card that reads "Invalid report". The message beside it is prose and may change.

| Rule | Fails when |
|---|---|
| `invalid_json` | The file does not parse as JSON |
| `schema_version` | Absent, or not exactly `"1"` |
| `required_field` | Any required field above is absent or of the wrong type |
| `enum_kind` | `kind` is not `agent` or `project` |
| `enum_state` | A `stages[].state` is outside the four allowed values |
| `stages_shape` | `stages` is not exactly the 7 ids in the fixed order |
| `stages_order` | The joined state sequence does not match the state-sequence rule |
| `stage_date` | A `done` or `blocked` stage has no `YYYY-MM-DD` date |
| `building_range` | `building` is present and `done` or `total` is not an integer of 0 or more, or `done` exceeds `total` |
| `date_format` | `updated_at` is not a real `YYYY-MM-DD` date |
| `source_commit` | Not 7 to 40 hexadecimal characters |
| `private_info` | Any string in the document contains a local home-directory path, an email address, a link into a private repository of this organisation, or a token prefix |

`private_info` runs over every string in the document, including nested notes, feature bullets and
keys. It is what keeps the page safe to be public: a report that fails it is never rendered.

## Writing rules for the public text

`public_summary`, `features_built`, `features_pending` and every `note` are read by senior,
non-technical stakeholders on a public page. Write them that way.

- **One sentence for `public_summary`.** Say what the unit *does*, not how it is built.
- **12 words or fewer per feature bullet.** Capability, not implementation: "Writes a shot list from a
  brief", never a sentence about an API or a schema.
- **No jargon that needs the repository to decode:** no task ids, no step numbers, no tool names, no
  internal acronyms.
- **Plain present tense.** "Already does" and "Still to build" are the questions being answered.
- **English, always.**
- **Nothing private:** no local path, no email address, no link to a private repository, no token.

## Validating before you publish

From the board repository's root, run its validator against your file. Exit `0` means valid; exit
`1` prints `rule: <name> — <message>` and names the rule that failed; exit `2` is a usage error.

```
node scripts/validate.mjs path/to/progress.json
```

A report that does not validate is rendered as "Invalid report" with the rule name, and every other
unit on the board is unaffected. A unit with no `progress.json` at all is rendered as "No report yet".
