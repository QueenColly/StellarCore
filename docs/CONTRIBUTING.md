
# Contributing to StellarCore

Thank you for contributing to StellarCore. The project is maintained through
reviewed pull requests so that changes remain clear, testable, and supported by
evidence.

## Getting Started

Follow the setup instructions in the README's
[Getting Started](README.md#getting-started) section.

Do not request direct write access to the repository. Fork it and work from
your own copy.

## Branch Workflow

New community contributions must be submitted through pull requests targeting
the **`development`** branch.

The long-lived branches have the following purposes:

| Branch | Purpose | Contribution policy |
| --- | --- | --- |
| `development` | Integration, testing, and release preparation | Target for new community pull requests |
| `main` | Production | Maintainer-managed; contributors must not target or modify it |
| `contributions` | Retained branch from an earlier contribution workflow | Not the target for new community pull requests |

The active contributor workflow is:

```text
Contributor fork
      |
      v
Focused branch created from upstream/development
      |
      v
Pull request into Aboyeji-Isaac/StellarCore:development
      |
      v
Review and required checks
      |
      v
Maintainer-managed merge and release process
```

Earlier documentation described a `contributions` → `development` → `main`
workflow and instructed community contributors to target `contributions`.
That is historical guidance and is superseded by the current requirement:
new community pull requests must target `development`.

The repository may continue to run CI on the `contributions` branch for
existing branch activity. This does not change the required base branch for
new community contributions.

### Fork and clone the repository

Replace `<your-github-username>` with your GitHub username:

```bash
git clone https://github.com/<your-github-username>/StellarCore.git
cd StellarCore

git remote add upstream https://github.com/Aboyeji-Isaac/StellarCore.git
git fetch upstream
```

### Create a focused branch from development

Use a descriptive branch name with the appropriate prefix:

| Prefix | Purpose | Example |
| --- | --- | --- |
| `feat/` | New functionality | `feat/anchor-search` |
| `fix/` | Bug fixes | `fix/rate-panel-empty-state` |
| `docs/` | Documentation changes | `docs/api-error-guide` |
| `chore/` | Maintenance and tooling | `chore/update-dependencies` |

For example, to create a documentation branch:

```bash
git switch -c docs/your-documentation-change --track upstream/development
```

Keep each branch focused on one related change. Avoid combining unrelated
features, fixes, and documentation updates in the same pull request.

### Keep your branch updated

Before submitting your pull request, fetch the latest upstream changes:

```bash
git fetch upstream
git rebase upstream/development
```

Resolve any conflicts locally and rerun the relevant checks before pushing.

### Push your branch to your fork

```bash
git push -u origin docs/your-documentation-change
```

Replace the example branch name with the branch you created.

### Open the pull request

Create a pull request with:

- **Base repository:** `Aboyeji-Isaac/StellarCore`
- **Base branch:** `development`
- **Head repository:** your fork
- **Compare branch:** your focused contribution branch

Do not select `main` as the pull request base. Do not push directly to
`development` or `main`.

## Before Opening a Pull Request

Run the checks appropriate to your contribution from the repository root.

The project uses Node.js 22. The CI workflow performs the following validation:

```bash
npm ci --ignore-scripts
npx prisma generate

npm run lint
npx tsc --noEmit
npm test

npm run audit:config
npm run audit:sql
npm run audit:compatibility

npm audit --omit=dev --audit-level=critical
npm run build
```

If a check fails, investigate and resolve the failure before requesting review.
Do not claim that a check passed unless it was actually executed successfully.

Documentation-only contributions should still be checked for:

- Correct technical statements against the current `development` implementation.
- Valid relative links and repository paths.
- Accurate commands, endpoint names, and terminology.
- Clearly labelled illustrative examples.
- Consistent Markdown headings, tables, and code fences.
- No unsupported claims about live availability, firm quotes, verified
  transfers, or reputation scores.

## Pull Request Requirements

A useful pull request should include:

1. A short, descriptive title.
2. A summary of the change and the problem it addresses.
3. The relevant issue reference, using a closing keyword when appropriate.
4. The files or implementation areas reviewed.
5. Relevant test results or a clear explanation of checks not run.
6. Any known limitations or behavior that remains unsupported.

Use a focused description. Explain what changed, why it changed, and how
reviewers can verify it.

All new community pull requests must target `development`.

## Changelog

[`CHANGELOG.md`](CHANGELOG.md) tracks notable changes in a lightweight
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style.

If your pull request is meaningful to users, contributors, or reviewers,
add an entry under `Unreleased` in the same pull request.

1. Choose the matching subsection: `Added`, `Changed`, `Fixed`, `Deprecated`,
   or `Removed`. Create it if it does not exist.
2. Write one concise bullet in the past tense, describing the change from the
   reader's perspective.
3. Reference the issue or pull request number when applicable.
4. Do not edit dated release sections or invent version numbers. Maintainers
   move entries into a dated release when that release ships.

Small typo fixes and changes that are purely internal to CI or tooling do not
need a changelog entry.

## Branch Protection and Required Checks

Contributors must use reviewed pull requests. Do not push directly to
protected repository branches.

The repository's pull request workflow includes these required status checks:

- **`Scan untrusted PR changes`** — a read-only scan of pull request metadata,
  file paths, sizes, and added patch lines. It does not check out, install,
  build, or run contributor code.
- **`Lint, typecheck, test, build`** — lint, TypeScript checking, automated
  tests, configuration/SQL/compatibility audits, dependency audit, and
  production build.

**`PR Participant Guard`** is an advisory check, not a required status check.
It reports authenticated human GitHub accounts that are neither a maintainer
nor an assignee of an issue linked by a closing keyword. Reference the issue
you are assigned to, for example `Closes #12`.

Bot and AI-agent accounts are permitted automatically. Contributors are not
restricted by which coding agent they use.

See [PR Participant Guard](docs/pr-participant-guard.md) for details.

Path-specific audit workflows may also run when a pull request touches the
areas they cover.

## Evidence Integrity

StellarCore is a read-only evidence platform. Contributions must preserve the
distinction between:

- **Reviewed configuration:** information explicitly reviewed and stored in
  the repository.
- **Advertised interfaces:** capabilities declared by an anchor through its
  SEP metadata.
- **Persisted observations:** information successfully captured and stored
  by StellarCore.

Do not present configuration as proof of live availability, advertised SEP
interfaces as proof of a working service, indicative rates as firm quotes, or
corridor associations as verified or executable transfers.

Do not invent reputation scores or evidence that the implementation has not
persisted.

All technical and product claims must be supported by the current
implementation or clearly identified as proposed or illustrative.
