---
description: Write-as-public rules for every string a stakeholder or a crawler can read
paths:
  - "README.md"
  - "docs/**"
  - "progress.json"
  - "manifest.json"
  - "skills/**"
---

# Public text

Everything matching these globs is either published on a public page or committed to a public
repository. Write it as if a stakeholder outside the team will read it, because they will.

**Never write, anywhere in these files:**

- an absolute local path — `/Users/…`, `~/Documents/…`, a Windows drive letter;
- an email address, a phone number, or a person's name other than as an owner label;
- a URL into a private repository — `github.com/oegit/<anything>` — because every unit repository is
  private and the link is a dead end at best;
- a token, a token prefix (`ghp_`, `github_pat_`), a session id, or any credential value;
- an internal system name, a client name, or a revenue figure.

`scripts/validate.mjs`'s `private_info` rule blocks the first four in any `progress.json` before it
can be published, and `tests/repo-rules.test.mjs` sweeps the committed text files. **Both are gates,
not reminders** — a violation fails the build rather than shipping quietly.

**Two documented exceptions, deliberate and bounded:**

- `manifest.json` carries the *names* of the 8 private repositories, because the generator needs them
  and every local gate reads the file. The names are published; the contents are not, and the rendered
  page never links to them.
- The `report-progress` skill source and `docs/OPERATIONS.md` name the board repository's own public
  URL and the secret's **name** (never its value).

**Style, for anything a stakeholder reads:**

- One sentence for `public_summary`. Say what the unit *does*, not how it is built.
- ≤ 12 words per bullet in `features_built` and `features_pending`. Capability, not implementation:
  "Writes a shot list from a brief", never "Calls the Claude API with a JSON schema".
- No jargon that needs this repository to decode: no task ids, no step numbers, no tool names, no
  internal acronyms.
- Plain present tense. "Already does" and "Still to build" are the questions being answered.
- English, always — even though the working conversation is in Spanish.
