# PR Participant Guard

The PR Participant Guard checks who has participated in a pull request before maintainers treat it as ready to merge. It is an identity/participation control, not a malware detector and not a judgment about intent.

## Policy

The guard reports **authenticated human GitHub accounts** that participated in a pull request and are not authorized for it. Exactly two kinds of human participant are authorized:

1. a maintainer listed under `maintainers` in `.github/pr-participant-guard.json`; and
2. a contributor assigned to an issue referenced with a closing keyword in the pull request body.

Everything else follows from that. A documented, unexpired `exceptions` entry may authorize one additional login temporarily.

### Agents and bots

Every GitHub account whose API account type is `Bot` is permitted, in every participation role, without any individual approval and whatever the account is called. GitHub Apps, `github-actions[bot]`, program bots, and AI coding agents that act through their own GitHub account are all covered by this single rule. There is no agent allowlist to maintain.

Contributors are never restricted by which coding agent they use. Claude Code, Codex, Copilot, Codebuff, and any other tool are all equally acceptable; what the guard looks at is the authenticated human account behind the participation.

### Identity sources

The guard considers the pull request author; conversation comments; submitted reviews; inline review comments; commit authors and committers; current requested reviewers; and review-request / review-request-removal events available through GitHub's issue timeline. For deleted comment events, it also checks the comment identity retained in the webhook payload.

Each of those records is an account GitHub itself authenticated, carrying a login, a numeric id, and an account type. The guard reads identity **only** from those records. It does not read identity from commit message text, commit author or committer email addresses, or `Co-authored-by` trailers, because nothing authenticates them.

### Co-author trailers are not participants

`Co-authored-by` trailers are free text in a commit message. They are ignored entirely when determining participants. A commit that credits an AI agent, a pairing partner, or anyone else adds no participant and produces no finding. There is no co-author allowlist and no maintainer attestation mechanism; both were removed as unnecessary under this policy.

StellarCore still does not credit AI tools as co-authors in new work: Claude Code's automatic attribution stays disabled for this repository. That is a commit-hygiene rule, not a guard rule. Historical commits that carry such a trailer are not rewritten and no longer produce findings.

### Requested reviewer teams

A team is not an authenticated human identity, so requested reviewer teams are ignored. Members of a requested team are evaluated individually if and when they actually participate.

### GitHub web-flow committer

Commits that GitHub creates on a user's behalf (web edits, merges, or the "Update branch" button) have the committer `web-flow`, an account GitHub reports with type `User`. It is accepted as a machine identity only when **all** of these hold, as configured in `verifiedWebFlowCommitter`:

- it appears in the committer role (never as author, commenter, or reviewer);
- the committer email equals the approved address `noreply@github.com`; and
- GitHub reports `verification.verified: true` with reason `valid`.

If those conditions are not met, the committer is reported as an **uncertainty** naming the failed condition, not as an unauthorized human. The commit author is still evaluated separately, and a verified web-flow committer never excuses it.

### Uncertainties

Where an account's identity or human/bot classification cannot be established, the guard reports the uncertainty instead of inventing a human identity. Uncertainties are informational and do not fail the check. They are raised when:

- a commit author or committer is not mapped to any GitHub account (the unauthenticated email address is deliberately not reported as an identity);
- a participation record carries no login; or
- an account's type is absent or is neither `User` nor `Bot`.

### Counting

Unauthorized humans are deduplicated by authenticated GitHub account. One person who authored three commits and left two comments is one finding listing up to three of their participation records plus a count of the rest, not five findings. `unauthorizedHumanCount` reports the number of distinct accounts.

### Maintainer-authored pull requests

A pull request with no closing issue reference is normally **inconclusive**, because contributor assignment cannot be verified. The single exception is a pull request whose author (`pull.user.login`, the identity GitHub authenticates) is listed under `maintainers`. Maintainer-authored pull requests therefore never need an issue reference, and the maintainer can open, edit, review, and update them freely.

For such a pull request every participant is still evaluated, using `maintainers` without assignee logins, so an unexpected human commenter, reviewer, commit author, or committer still fails the check.

Maintainer status is derived **only** from the pull request author. Commit authors and committers, email addresses, and trailers never make a pull request maintainer-authored.

### Configuration validation

`maintainers` and `exceptions` must be lists, `maintainers` must contain only non-empty strings, and `verifiedWebFlowCommitter` must contain a `login` and an `email`. An invalid configuration makes the result inconclusive rather than relaxing any rule.

## Outcomes

- **Pass:** every authenticated human participant is a maintainer or an assignee of a linked issue. Uncertainties may still be listed.
- **Failure:** at least one authenticated human participant is authorized by neither rule. Investigate the account and its participation, then resolve it before treating the pull request as merge-ready.
- **Inconclusive:** the linked issue or assignment is missing, the configuration is invalid, or an API response/pagination result is incomplete. This fails the check rather than assuming the pull request is safe.

A reported account is a reason to investigate, not by itself proof of malicious behavior. A branch-synchronization pull request that re-introduces other contributors' commits legitimately reports those contributors; resolve it with the maintainer's normal decision rather than an allowlist entry.

## Workflow safety and coverage

The workflow uses only `pull_request_target`, with read-only `contents`, `issues`, and `pull-requests` permissions. That event always runs the workflow definition from the trusted default branch. The workflow checks out trusted code from the default branch, disables persisted checkout credentials, and reads PR data through the GitHub API. It does not check out, install, build, or execute contributor code.

It runs when a PR is opened, reopened, synchronized, marked ready for review, edited (including body or issue-reference changes), or has a reviewer requested or removed. It queries paginated comments, reviews, review comments, commits, issue timeline events, and linked issue assignment data. API errors, unexpected response shapes, and incomplete pagination fail closed.

`issue_comment`, `pull_request_review`, and `pull_request_review_comment` are deliberately **not** triggers. Review events run the pull request's own copy of this workflow, so a PR could replace the check with its own definition; this was confirmed during the PR #612 investigation. `issue_comment` runs attach their result to the default branch rather than the PR. Because new comments and reviews therefore do not re-run the guard automatically, re-run the latest guard job before treating a PR as merge-ready. A re-run fetches current participation data. The deleted-comment payload handling remains in the script but is not reached by the remaining triggers.

Because the trusted default-branch definition is used, changes to the guard, its configuration, or its workflow take effect only after they are merged into the default branch. The guard's result on the PR that changes it still reflects the previous version.

**Actions event policy:** beginning 2026-12-02, GitHub blocks `pull_request_target` in public repositories unless an applicable Actions event policy allows it. Repository policy 15831 covers only the malware scanner workflow. The guard needs its own policy, scoped to `.github/workflows/pr-participant-guard.yml` and allowing only `pull_request_target`, before that date; creating it is a separate administrative change.

**History limitation:** GitHub does not expose every deleted/edited historical item or every reviewer-change detail consistently through the same REST endpoints. The guard can only check the participation records and timeline events GitHub exposes at evaluation time. It must not be described as a perfect audit log.

## Required rollout steps

1. Review the guard code and test results on the implementation branch.
2. Merge the workflow/configuration only through the repository's normal maintainer process.
3. In the branch protection rule or ruleset for each protected target branch, add the exact required status check **`PR Participant Guard`**. A failing workflow alone does not block merging unless this check is required.
4. Keep the branch-protection configuration as a separate, explicit administrative change. Revisit the check after any GitHub event/API behavior change.

The guard is currently advisory: it is not a required status check. The required checks are `Scan untrusted PR changes` and `Lint, typecheck, test, build`, and this policy change does not alter them. The guard's check name is not one of the required names protected by the malware scanner's `required-check-name-collision` rule; if the guard is ever made required, add it to that rule's trusted list first.

The workflow currently targets PRs into `contributions`, `development`, and `main`. It checks out the default branch because `pull_request_target` must not execute code supplied by the PR. Consequently, a new workflow cannot run as the trusted workflow for its own initial PR before it exists on the default branch. Until rollout is complete and the status check is required, it is advisory rather than a merge barrier.
