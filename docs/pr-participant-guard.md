# PR Participant Guard

The PR Participant Guard checks who has participated in a pull request before maintainers treat it as ready to merge. It is an identity/participation control, not a malware detector and not a judgment about intent.

## Policy

The guard considers the PR author; conversation comments; submitted reviews; inline review comments; commit authors and committers (including unmapped commit emails); `Co-authored-by` email trailers; current requested reviewers and teams; and review-request / review-request-removal events available through GitHub's issue timeline. For deleted comment events, it also checks the comment identity retained in the webhook payload.

An identity is accepted only when it is:
- listed under `maintainers` in `.github/pr-participant-guard.json`;
- an assignee of an issue referenced with a closing keyword in the PR body;
- explicitly listed under `approvedBots`, `approvedCommitEmails`, `approvedCoauthorEmails`, or `approvedReviewerTeams`;
- a `maintainerAttestedCoauthorEmails` address that satisfies every attestation condition below;
- the GitHub `web-flow` account in the committer role under the verified conditions below; or
- covered by a documented exception with a reason and future `expiresAt` timestamp.

Unknown bot accounts are not automatically trusted. Keep the approved lists narrow. Exceptions are temporary and should be removed when no longer needed. For contributor PRs, include a closing reference such as `Closes #123` and assign the issue before expecting a passing result.

### Maintainer-authored pull requests

A PR with no closing issue reference is normally **inconclusive**, because contributor assignment cannot be verified. The single exception is a PR whose author (`pull.user.login`, the identity GitHub authenticates) is listed under `maintainers`. For such a PR every participant is still evaluated, using `maintainers` and `approvedBots` without assignee logins, so any unexpected commenter, reviewer, commit author, committer, or co-author still fails the check.

Maintainer status is derived **only** from the PR author. Commit authors and committers (which GitHub maps from unauthenticated commit email addresses), email addresses, and free-text trailers never make a PR maintainer-authored. A maintainer PR that does include a closing reference uses the normal linked-issue rules.

### Maintainer-attested co-authors

`Co-authored-by` trailers are free text that anyone can write. Addresses in `approvedCoauthorEmails` are accepted on any commit; that list is intentionally empty. Addresses in `maintainerAttestedCoauthorEmails` (currently `noreply@anthropic.com` and the maintainer's GitHub noreply address) are accepted for a specific commit only when all of the following hold:

1. the PR author is a configured maintainer;
2. the PR head repository equals the base repository, so only users with write access could have pushed the commit;
3. the commit's GitHub-mapped author is a maintainer; and
4. the commit's GitHub-mapped committer is a maintainer or a verified `web-flow` committer.

If any of this metadata is missing, the address is reported with the failed condition (fail closed). Conditions 3 and 4 only narrow acceptance; they never grant maintainer status.

### GitHub web-flow committer

Commits that GitHub creates on a user's behalf (web edits, merges, or the "Update branch" button) have the committer `web-flow`. Because GitHub maps that login from the committer email, which anyone can set, `web-flow` is accepted only when **all** of these hold, as configured in `verifiedWebFlowCommitter`:

- it appears in the committer role (never as author, commenter, or reviewer);
- the committer email equals the approved address `noreply@github.com`; and
- GitHub reports `verification.verified: true` with reason `valid`.

The commit author is still evaluated separately.

### Co-author trailer parsing

Only lines in the exact form `Co-authored-by: Name <email>` (any key case, one address, nothing after it) are parsed as attribution. Any other line that looks like co-author attribution, such as indented lines, a space before the colon, text after the address, a missing angle-bracketed address, several addresses on one line, or separator variants like `Co-Authored_By`, is reported as **malformed or unrecognized attribution** together with any addresses it contains. Malformed attribution cannot be excused by an exception entry. Lookalike Unicode characters in the key are not detected.

### Configuration validation

List fields must be lists of non-empty strings, and `verifiedWebFlowCommitter` must contain a `login` and an `email`. An invalid configuration makes the result inconclusive rather than relaxing any rule.

## Outcomes

- **Pass:** all observed identities match the configured policy.
- **Failure:** at least one observed identity is unexpected. Investigate the identity and participation, then resolve it before treating the PR as merge-ready.
- **Inconclusive:** the linked issue or assignment is missing, or an API response/pagination result is incomplete. This fails the check rather than assuming the PR is safe.

The check reports identities and their participation source. An unexpected account is a reason to investigate, not by itself proof of malicious behavior.

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

The guard is currently advisory: it is not a required status check. Its check name is not one of the required names protected by the malware scanner's `required-check-name-collision` rule; if the guard is ever made required, add it to that rule's trusted list first.

The workflow currently targets PRs into `development` and `main`. It checks out the default branch because `pull_request_target` must not execute code supplied by the PR. Consequently, a new workflow cannot run as the trusted workflow for its own initial PR before it exists on the default branch. Until rollout is complete and the status check is required, it is advisory rather than a merge barrier.
