# Contributing to StellarCore

Thank you for contributing to StellarCore. The project is maintained through
reviewed pull requests so that changes remain clear, testable, and supported by
evidence.

## Getting Started

Follow the setup instructions in the README's [Getting Started](README.md#getting-started)
section. Do not request direct write access to the repository; fork it instead
and work from your fork.

## Branch Workflow

StellarCore uses three long-lived branches, and changes move in one direction
only:

| Branch | Purpose | Who opens pull requests into it |
| --- | --- | --- |
| `contributions` | Community contributions and new features | Contributors |
| `development` | Staging, integration testing, and release preparation | Maintainers promoting reviewed work |
| `main` | Production only | Maintainers |

`contributions` → `development` → `main`. Contributors target **`contributions`**.
Only reviewed and approved changes are promoted from `contributions` into
`development`, and only release-ready work is promoted from `development` into
`main`.

Create a focused branch from `contributions` using one of these prefixes:

- `feat/` for a new feature
- `fix/` for a bug fix
- `docs/` for documentation changes
- `chore/` for maintenance and tooling

Use a short, descriptive name after the prefix, such as `docs/contributing`.

## Before Opening a Pull Request

Run these checks from the repository root:

```bash
npx tsc --noEmit
npm run lint
npm test
```

Open a pull request from your fork's branch into `contributions`. Describe what changed,
include relevant tests and evidence, reference the issue being resolved when
applicable (for example `Closes #12`), and add a changelog entry under
`Unreleased` when applicable — see [Changelog](#changelog) below.

## Changelog

[`CHANGELOG.md`](CHANGELOG.md) tracks notable changes in a lightweight
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style. If your pull
request is meaningful to users, contributors, or reviewers — a new feature, a
fix, a behavior change, or a notable piece of documentation — add an entry
under the `Unreleased` section in the same pull request:

1. Choose the matching subsection — `Added`, `Changed`, `Fixed`, `Deprecated`,
   or `Removed` — creating it if it does not exist yet.
2. Write one concise bullet in the past tense, describing the change from the
   reader's perspective, and reference the issue or PR number when applicable.
3. Do not edit dated release sections or invent version numbers; maintainers
   move entries into a dated release when that release ships.

Small typo fixes and changes that are purely internal to CI or tooling do not
need an entry.

## Branch Protection and Required Checks

Every branch in the workflow is maintained through reviewed pull requests; no
contributor pushes directly to `contributions`, `development`, or `main`.

Pull requests into `contributions` and `development` must pass the same two
required status checks before they can merge:

- **`Scan untrusted PR changes`** — a read-only malware scan of the pull
  request's metadata, file paths, sizes, and added patch lines. It never checks
  out, installs, builds, or runs contributor code.
- **`Lint, typecheck, test, build`** — lint, `tsc --noEmit`, the full test
  suite, the configuration/SQL/compatibility audits, and a production build.

**`PR Participant Guard`** also runs on these pull requests. It is advisory, not
a required check. It reports authenticated human GitHub accounts that are
neither a maintainer nor an assignee of an issue the pull request links with a
closing keyword, so reference the issue you are assigned to (for example
`Closes #12`). Bot and AI-agent accounts are permitted automatically, and you
are never restricted by which coding agent you use — see
[docs/pr-participant-guard.md](docs/pr-participant-guard.md).

Path-specific audit workflows additionally run when a pull request touches the
areas they cover.

## Evidence Integrity

StellarCore depends on trustworthy, verifiable information. Pull requests that
fabricate data, bypass validation, or present unverified information as fact
will not be merged, regardless of code quality.
