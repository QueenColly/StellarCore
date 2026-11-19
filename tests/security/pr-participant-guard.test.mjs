import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateParticipantData,
  parseClosingIssueNumbers,
  parseCoauthorEmails,
  parseCoauthorTrailers,
  readAllPages,
} from "../../scripts/security/check-pr-participants.mjs";

const config = {
  maintainers: ["Aboyeji-Isaac"],
  approvedBots: ["release-bot[bot]"],
  approvedCommitEmails: ["assigned@example.test"],
  approvedCoauthorEmails: ["maintainer@example.test"],
  approvedReviewerTeams: ["core-reviewers"],
  exceptions: [
    { login: "temporary-reviewer", reason: "approved incident review", expiresAt: "2099-01-01T00:00:00.000Z" },
    { login: "expired-reviewer", reason: "old exception", expiresAt: "2020-01-01T00:00:00.000Z" },
  ],
};

function fixture(overrides = {}) {
  return {
    pull: {
      body: "Implements the guard. Closes #42",
      user: { login: "assigned-contributor" },
      requested_reviewers: [],
      requested_teams: [],
    },
    comments: [],
    reviews: [],
    reviewComments: [],
    commits: [
      {
        sha: "abcdef012345",
        author: { login: "assigned-contributor" },
        committer: { login: "assigned-contributor" },
        commit: { message: "feat: implement guard" },
      },
    ],
    issueEvents: [],
    linkedIssues: [{ number: 42, assignees: [{ login: "assigned-contributor" }] }],
    ...overrides,
  };
}

test("parses closing issue references and deduplicates them", () => {
  assert.deepEqual(
    parseClosingIssueNumbers("Fixes #42; closes #42 and Resolves https://github.com/org/repo/issues/17"),
    [42, 17],
  );
});

test("parses Co-authored-by email trailers case-insensitively", () => {
  assert.deepEqual(
    parseCoauthorEmails("feat: sample\n\nCo-authored-by: Maintainer <MAINTAINER@example.test>\nCo-authored-by: Stranger <stranger@example.test>"),
    ["maintainer@example.test", "stranger@example.test"],
  );
});

test("assigned contributor and configured maintainer pass", () => {
  const result = evaluateParticipantData(fixture({
    comments: [{ user: { login: "Aboyeji-Isaac" } }],
    reviews: [{ user: { login: "assigned-contributor" } }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("explicitly approved bot and reviewer team pass", () => {
  const result = evaluateParticipantData(fixture({
    comments: [{ user: { login: "release-bot[bot]" } }],
    issueEvents: [{
      event: "review_requested",
      actor: { login: "Aboyeji-Isaac" },
      requested_team: { slug: "core-reviewers" },
    }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "pass");
});

test("unexpected conversation commenter and submitted reviewer fail", () => {
  const result = evaluateParticipantData(fixture({
    comments: [{ user: { login: "unexpected-person" } }],
    reviews: [{ user: { login: "another-person" } }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "failure");
  assert.ok(result.findings.some((finding) => finding.includes('unexpected-person') && finding.includes("conversation comment")));
  assert.ok(result.findings.some((finding) => finding.includes('another-person') && finding.includes("submitted review")));
});

test("unexpected inline reviewer and commit author/committer fail", () => {
  const result = evaluateParticipantData(fixture({
    reviewComments: [{ user: { login: "inline-stranger" } }],
    commits: [{
      sha: "0123456789ab",
      author: { login: "commit-author" },
      committer: { login: "commit-committer" },
      commit: { message: "fix: something" },
    }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "failure");
  for (const identity of ["inline-stranger", "commit-author", "commit-committer"]) {
    assert.ok(result.findings.some((finding) => finding.includes(identity)), identity);
  }
});

test("unexpected Co-authored-by email fails unless explicitly approved", () => {
  const result = evaluateParticipantData(fixture({
    commits: [{
      sha: "abcdef012345",
      author: { login: "assigned-contributor" },
      committer: { login: "assigned-contributor" },
      commit: { message: "feat: shared\n\nCo-authored-by: Stranger <stranger@example.test>" },
    }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "failure");
  assert.ok(result.findings.some((finding) => finding.includes("stranger@example.test")));
});

test("review requested and removed events inspect both requester and target", () => {
  const result = evaluateParticipantData(fixture({
    issueEvents: [
      { event: "review_requested", actor: { login: "Aboyeji-Isaac" }, requested_reviewer: { login: "unexpected-reviewer" } },
      { event: "review_request_removed", actor: { login: "assigned-contributor" }, requested_reviewer: { login: "removed-unexpected-reviewer" } },
    ],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "failure");
  assert.ok(result.findings.some((finding) => finding.includes("unexpected-reviewer")));
  assert.ok(result.findings.some((finding) => finding.includes("removed-unexpected-reviewer")));
});

test("reviewer-change webhook payload is checked immediately", () => {
  const requested = evaluateParticipantData(fixture({
    eventPayload: {
      action: "review_requested",
      sender: { login: "unexpected-requester" },
      requested_reviewer: { login: "unexpected-reviewer" },
    },
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(requested.status, "failure");
  assert.ok(requested.findings.some((finding) => finding.includes("unexpected-requester")));
  assert.ok(requested.findings.some((finding) => finding.includes("unexpected-reviewer")));

  const removed = evaluateParticipantData(fixture({
    eventPayload: {
      action: "review_request_removed",
      sender: { login: "assigned-contributor" },
      requested_team: { slug: "unapproved-team" },
    },
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(removed.status, "failure");
  assert.ok(removed.findings.some((finding) => finding.includes("unapproved-team")));
});

test("current requested reviewer is included even if no timeline event is present", () => {
  const result = evaluateParticipantData(fixture({
    pull: {
      body: "Closes #42",
      user: { login: "assigned-contributor" },
      requested_reviewers: [{ login: "unexpected-reviewer" }],
      requested_teams: [],
    },
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(result.status, "failure");
  assert.ok(result.findings.some((finding) => finding.includes("currently requested reviewer")));
});

test("active documented exception passes but expired exception does not", () => {
  const active = evaluateParticipantData(fixture({
    comments: [{ user: { login: "temporary-reviewer" } }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  const expired = evaluateParticipantData(fixture({
    comments: [{ user: { login: "expired-reviewer" } }],
  }), config, Date.parse("2026-10-22T00:00:00.000Z"));
  assert.equal(active.status, "pass");
  assert.equal(expired.status, "failure");
});

test("missing linked issue or missing issue assignment fails closed as inconclusive", () => {
  const noIssue = evaluateParticipantData(fixture({
    pull: { body: "A change without issue reference", user: { login: "assigned-contributor" }, requested_reviewers: [] },
  }), config);
  assert.equal(noIssue.status, "inconclusive");

  const unassigned = evaluateParticipantData(fixture({
    linkedIssues: [{ number: 42, assignees: [] }],
  }), config);
  assert.equal(unassigned.status, "inconclusive");
});

test("incomplete linked issue response fails closed as inconclusive", () => {
  const result = evaluateParticipantData(fixture({ linkedIssues: [] }), config);
  assert.equal(result.status, "inconclusive");
});

test("new unexpected participation changes a previously passing result to failure", () => {
  assert.equal(evaluateParticipantData(fixture(), config).status, "pass");
  assert.equal(evaluateParticipantData(fixture({
    comments: [{ user: { login: "new-unexpected-participant" } }],
  }), config).status, "failure");
});

test("workflow is read-only, runs only trusted pull_request_target events, and uses default-branch code", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/pr-participant-guard.yml", import.meta.url), "utf8");
  assert.match(workflow, /\non:\n  pull_request_target:\n    branches: \[development, main\]\n    types: \[opened, reopened, synchronize, ready_for_review, edited, review_requested, review_request_removed\]\n\n/);
  // Review events run the PR's own copy of the workflow; issue_comment results never attach to the PR.
  assert.doesNotMatch(workflow, /^\s*issue_comment:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request_review:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request_review_comment:/m);
  assert.doesNotMatch(workflow, /^\s*(?:pull_request|push|workflow_run|merge_group):/m);
  assert.doesNotMatch(workflow, /github\.event\.issue/);
  assert.match(workflow, /review_requested/);
  assert.match(workflow, /review_request_removed/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /issues: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /pull-requests: write|issues: write|contents: write/);
  assert.doesNotMatch(workflow, /npm install|npm ci|pnpm install|npm test/);
});


test("API failures and incomplete pagination reject instead of silently passing", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => new Response(JSON.stringify({ message: "forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(readAllPages("https://api.github.com/repos/org/repo/issues/1/comments?per_page=100", "token"), /HTTP 403/);

  globalThis.fetch = async () => new Response(JSON.stringify({ unexpected: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(readAllPages("https://api.github.com/repos/org/repo/issues/1/comments?per_page=100", "token"), /Expected an array response/);

  globalThis.fetch = async () => new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ id: index }))), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(readAllPages("https://api.github.com/repos/org/repo/issues/1/comments?per_page=100", "token"), /omitted Link header/);
});


test("unmapped commit author and committer emails are checked against an explicit allowlist", () => {
  const approved = evaluateParticipantData(fixture({
    commits: [{
      sha: "abcdef012345",
      author: null,
      committer: null,
      commit: {
        author: { email: "assigned@example.test" },
        committer: { email: "stranger@example.test" },
        message: "feat: identity test",
      },
    }],
  }), config);
  assert.equal(approved.status, "failure");
  assert.ok(approved.findings.some((finding) => finding.includes("stranger@example.test")));
  assert.ok(!approved.findings.some((finding) => finding.includes("assigned@example.test")));
});

test("deleted-comment webhook payload preserves an identity absent from the current comment list", () => {
  const result = evaluateParticipantData(fixture({
    comments: [],
    eventPayload: {
      action: "deleted",
      comment: { user: { login: "deleted-comment-author" } },
    },
  }), config);
  assert.equal(result.status, "failure");
  assert.ok(result.findings.some((finding) => finding.includes("deleted-comment-author") && finding.includes("deleted comment event payload")));
});

// ---------------------------------------------------------------------------
// Maintainer exemption, attested co-authors, verified web-flow, and trailers.
// ---------------------------------------------------------------------------

const repo = { full_name: "Aboyeji-Isaac/StellarCore" };
const NOW = Date.parse("2026-11-19T00:00:00.000Z");
const ATTESTED = "noreply@anthropic.com";
const MAINTAINER_NOREPLY = "141873116+aboyeji-isaac@users.noreply.github.com";
const policyConfig = {
  maintainers: ["Aboyeji-Isaac"],
  approvedBots: [],
  approvedCommitEmails: [],
  approvedCoauthorEmails: [],
  maintainerAttestedCoauthorEmails: [ATTESTED, MAINTAINER_NOREPLY],
  verifiedWebFlowCommitter: { login: "web-flow", email: "noreply@github.com" },
  approvedReviewerTeams: [],
  exceptions: [],
};

function maintainerCommit(overrides = {}) {
  return {
    sha: "1111111aaaaaaa",
    author: { login: "Aboyeji-Isaac" },
    committer: { login: "Aboyeji-Isaac" },
    commit: {
      message: `security: change\n\nCo-authored-by: Claude <${ATTESTED}>`,
      committer: { email: MAINTAINER_NOREPLY },
      verification: { verified: false, reason: "unsigned" },
    },
    ...overrides,
  };
}

function webFlowCommit({ verified = true, reason = "valid", email = "noreply@github.com", author = "Aboyeji-Isaac", message = "Merge pull request #1" } = {}) {
  return {
    sha: "2222222bbbbbbb",
    author: { login: author },
    committer: { login: "web-flow" },
    commit: { message, committer: { email }, verification: { verified, reason } },
  };
}

function maintainerPr(overrides = {}) {
  return {
    pull: { body: "Maintenance change without an issue.", user: { login: "Aboyeji-Isaac" }, head: { repo }, base: { repo }, requested_reviewers: [], requested_teams: [] },
    comments: [],
    reviews: [],
    reviewComments: [],
    commits: [maintainerCommit()],
    issueEvents: [],
    linkedIssues: [],
    ...overrides,
  };
}

function evaluate(overrides) {
  return evaluateParticipantData(maintainerPr(overrides), policyConfig, NOW);
}

test("maintainer-authored PR without a linked issue passes when every participant is trusted", () => {
  const result = evaluate();
  assert.equal(result.status, "pass");
  assert.equal(result.mode, "maintainer");
  assert.deepEqual(result.findings, []);
});

test("maintainer exemption matches the authenticated PR author case-insensitively", () => {
  const result = evaluate({ pull: { ...maintainerPr().pull, user: { login: "  ABOYEJI-ISAAC " } } });
  assert.equal(result.status, "pass");
});

test("maintainer exemption still evaluates every other participant", () => {
  for (const overrides of [
    { comments: [{ user: { login: "outside-commenter" } }] },
    { reviews: [{ user: { login: "outside-reviewer" } }] },
    { reviewComments: [{ user: { login: "outside-inline" } }] },
    { commits: [maintainerCommit({ author: { login: "outside-author" } })] },
    { commits: [maintainerCommit({ committer: { login: "outside-committer" } })] },
    { issueEvents: [{ event: "review_requested", actor: { login: "Aboyeji-Isaac" }, requested_reviewer: { login: "outside-target" } }] },
  ]) {
    const result = evaluate(overrides);
    assert.equal(result.status, "failure", JSON.stringify(overrides));
    assert.equal(result.mode, "maintainer");
  }
});

test("maintainer status never comes from commit identities, emails, or trailers", () => {
  const spoofed = {
    pull: { body: "No issue.", user: { login: "outside-author" }, head: { repo }, base: { repo }, requested_reviewers: [] },
    commits: [maintainerCommit({
      commit: { message: `x\n\nCo-authored-by: Aboyeji-Isaac <${MAINTAINER_NOREPLY}>`, committer: { email: MAINTAINER_NOREPLY } },
    })],
  };
  const result = evaluate(spoofed);
  assert.equal(result.status, "inconclusive");
  assert.match(result.findings[0], /No closing reference/);
  const missingAuthor = evaluate({ pull: { body: "No issue.", head: { repo }, base: { repo } } });
  assert.equal(missingAuthor.status, "inconclusive");
});

test("non-maintainer and issue-linked PRs keep the existing rules", () => {
  const contributorNoIssue = evaluateParticipantData(fixture({ pull: { body: "No issue.", user: { login: "assigned-contributor" }, requested_reviewers: [] } }), config, NOW);
  assert.equal(contributorNoIssue.status, "inconclusive");
  // A maintainer PR with a closing reference still requires an assigned, fully returned issue.
  const linkedUnassigned = evaluate({ pull: { ...maintainerPr().pull, body: "Closes #77" }, linkedIssues: [{ number: 77, assignees: [] }] });
  assert.equal(linkedUnassigned.status, "inconclusive");
  const linkedMissing = evaluate({ pull: { ...maintainerPr().pull, body: "Closes #77" }, linkedIssues: [] });
  assert.equal(linkedMissing.status, "inconclusive");
  const linkedOk = evaluate({ pull: { ...maintainerPr().pull, body: "Closes #77" }, linkedIssues: [{ number: 77, assignees: [{ login: "helper" }] }] });
  assert.equal(linkedOk.status, "pass");
  assert.equal(linkedOk.mode, "linked-issue");
});

test("maintainer-attested co-author addresses are accepted only under every attestation condition", () => {
  assert.equal(evaluate().status, "pass");
  assert.equal(evaluate({ commits: [maintainerCommit({ commit: { message: `x\n\nCo-authored-by: Me <${MAINTAINER_NOREPLY.toUpperCase()}>` } })] }).status, "pass");

  const cases = [
    ["the pull request author is not a maintainer", {
      pull: { body: "Closes #5", user: { login: "helper" }, head: { repo }, base: { repo }, requested_reviewers: [] },
      linkedIssues: [{ number: 5, assignees: [{ login: "helper" }, { login: "Aboyeji-Isaac" }] }],
    }],
    ["the pull request head is not in this repository", { pull: { ...maintainerPr().pull, head: { repo: { full_name: "someone/fork" } } } }],
    ["head/base repository metadata is unavailable", { pull: { ...maintainerPr().pull, head: {} } }],
    ["head/base repository metadata is unavailable", { pull: { ...maintainerPr().pull, head: { repo: null } } }],
    ["the commit author is not mapped to a GitHub account", { commits: [maintainerCommit({ author: null })] }],
    ["the commit author is not a maintainer", { commits: [maintainerCommit({ author: { login: "helper" } })] }],
    ["the commit committer is not mapped to a GitHub account", { commits: [maintainerCommit({ committer: null })] }],
    ["the commit committer is neither a maintainer nor a verified web-flow committer", {
      commits: [{ ...webFlowCommit({ verified: false, reason: "unsigned" }), commit: { ...webFlowCommit({ verified: false, reason: "unsigned" }).commit, message: `x\n\nCo-authored-by: C <${ATTESTED}>` } }],
    }],
  ];
  for (const [reason, overrides] of cases) {
    const result = evaluate(overrides);
    assert.equal(result.status, "failure", reason);
    assert.ok(
      result.findings.some((finding) => finding.includes(ATTESTED) && finding.includes(`maintainer attestation not satisfied: ${reason}`)),
      `${reason}: ${JSON.stringify(result.findings)}`,
    );
  }
});

test("attested addresses are not globally trusted and unlisted co-authors still fail", () => {
  const unlisted = evaluate({ commits: [maintainerCommit({ commit: { message: "x\n\nCo-authored-by: Other <other@example.test>" } })] });
  assert.equal(unlisted.status, "failure");
  assert.ok(unlisted.findings.some((finding) => finding.includes("other@example.test")));
  // An attested address used as a commit author/committer email is not accepted.
  const asCommitEmail = evaluate({ commits: [maintainerCommit({ author: null, commit: { message: "x", author: { email: ATTESTED } } })] });
  assert.ok(asCommitEmail.findings.some((finding) => finding.includes(`unmapped commit author email`) && finding.includes(ATTESTED)));
});

test("a verified web-flow committer is accepted only in the committer role", () => {
  assert.equal(evaluate({ commits: [webFlowCommit()] }).status, "pass");
  const attestedViaWebFlow = webFlowCommit({ message: `Merge\n\nCo-authored-by: C <${ATTESTED}>` });
  assert.equal(evaluate({ commits: [attestedViaWebFlow] }).status, "pass");

  const rejected = [
    [webFlowCommit({ verified: false, reason: "unsigned" }), "web-flow commit lacks a valid verified GitHub signature"],
    [webFlowCommit({ verified: true, reason: "expired_key" }), "web-flow commit lacks a valid verified GitHub signature"],
    [{ ...webFlowCommit(), commit: { message: "m", committer: { email: "noreply@github.com" } } }, "web-flow commit lacks a valid verified GitHub signature"],
    [webFlowCommit({ email: "attacker@example.test" }), "web-flow committer email does not match the approved GitHub web-flow address"],
    [{ ...webFlowCommit(), commit: { message: "m", verification: { verified: true, reason: "valid" } } }, "web-flow committer email does not match the approved GitHub web-flow address"],
  ];
  for (const [commit, reason] of rejected) {
    const result = evaluate({ commits: [commit] });
    assert.equal(result.status, "failure", reason);
    assert.ok(result.findings.some((finding) => finding.includes('"web-flow"') && finding.includes(reason)), `${reason}: ${JSON.stringify(result.findings)}`);
  }

  // web-flow as an author, commenter, or reviewer is never accepted.
  assert.equal(evaluate({ commits: [webFlowCommit({ author: "web-flow" })] }).status, "failure");
  assert.equal(evaluate({ comments: [{ user: { login: "web-flow" } }] }).status, "failure");
  // A verified web-flow committer does not excuse the commit author.
  const outsideAuthor = evaluate({ commits: [webFlowCommit({ author: "outside-author" })] });
  assert.deepEqual(outsideAuthor.findings, ['Unexpected login "outside-author" in commit author (2222222).']);
  // Without a configured web-flow committer, web-flow stays unexpected.
  const noWebFlow = evaluateParticipantData(maintainerPr({ commits: [webFlowCommit()] }), { ...policyConfig, verifiedWebFlowCommitter: undefined }, NOW);
  assert.equal(noWebFlow.status, "failure");
});

test("strict trailer parsing reports malformed or unrecognized attribution", () => {
  assert.deepEqual(parseCoauthorTrailers("x\n\nCo-authored-by: A <A@X.io>\nco-authored-by:B <b@x.io>\r\n"), { emails: ["a@x.io", "b@x.io"], malformed: [] });
  const variants = [
    "  Co-authored-by: A <a@x.io>",
    "Co-authored-by : A <a@x.io>",
    "Co-authored-by: A <a@x.io> (pairing)",
    "Co-authored-by: A a@x.io",
    "Co-authored-by: A <a@x.io>, B <b@x.io>",
    "Co-Authored_By: A <a@x.io>",
    "Coauthored-by: A <a@x.io>",
    "Co-authored-by: A <not-an-email>",
    "Co-authored-by:",
  ];
  for (const line of variants) {
    const parsed = parseCoauthorTrailers(`subject\n\n${line}`);
    assert.deepEqual(parsed.emails, [], line);
    assert.equal(parsed.malformed.length, 1, line);
    const result = evaluate({ commits: [maintainerCommit({ commit: { message: `subject\n\n${line}` } })] });
    assert.equal(result.status, "failure", line);
    assert.ok(result.findings.some((finding) => finding.startsWith("Malformed or unrecognized Co-authored-by attribution")), line);
  }
  const both = parseCoauthorTrailers("s\n\nCo-authored-by: A <a@x.io>, B <b@x.io>");
  assert.deepEqual(both.malformed[0].emails, ["a@x.io", "b@x.io"]);
  // Malformed attribution cannot be excused by an exception entry.
  const excepted = evaluateParticipantData(
    maintainerPr({ commits: [maintainerCommit({ commit: { message: "s\n\n  Co-authored-by: A <a@x.io>" } })] }),
    { ...policyConfig, exceptions: [{ login: "Co-authored-by: A <a@x.io>", reason: "x", expiresAt: "2099-01-01T00:00:00.000Z" }] },
    NOW,
  );
  assert.equal(excepted.status, "failure");
  // Ordinary prose that merely mentions co-authors is not attribution.
  assert.deepEqual(parseCoauthorTrailers("docs: explain how Co-authored-by trailers work"), { emails: [], malformed: [] });
});

test("invalid guard configuration fails closed", () => {
  for (const bad of [
    null,
    { ...policyConfig, maintainerAttestedCoauthorEmails: ATTESTED },
    { ...policyConfig, maintainerAttestedCoauthorEmails: [""] },
    { ...policyConfig, maintainers: [42] },
    { ...policyConfig, verifiedWebFlowCommitter: { login: "web-flow" } },
    { ...policyConfig, verifiedWebFlowCommitter: "web-flow" },
  ]) {
    const result = evaluateParticipantData(maintainerPr(), bad, NOW);
    assert.equal(result.status, "inconclusive", JSON.stringify(bad));
    assert.match(result.findings[0], /Invalid participant-guard configuration/);
  }
  assert.equal(evaluateParticipantData({ pull: null }, policyConfig, NOW).status, "inconclusive");
});

test("repository configuration keeps attested addresses out of the global co-author list", async () => {
  const repoConfig = JSON.parse(await readFile(new URL("../../.github/pr-participant-guard.json", import.meta.url), "utf8"));
  assert.deepEqual(repoConfig.approvedCoauthorEmails, []);
  assert.deepEqual(repoConfig.maintainerAttestedCoauthorEmails, [ATTESTED, MAINTAINER_NOREPLY]);
  assert.deepEqual(repoConfig.verifiedWebFlowCommitter, { login: "web-flow", email: "noreply@github.com" });
  assert.deepEqual(repoConfig.maintainers, ["Aboyeji-Isaac"]);
  assert.deepEqual(repoConfig.approvedBots, []);
  assert.deepEqual(repoConfig.exceptions, []);
});

test("historical shapes: maintainer AI-assisted PR passes; history-sync PR fails only on outside identities", () => {
  // Shape of #613: maintainer-authored, local commits, Claude co-author trailer.
  assert.equal(evaluate({ commits: [maintainerCommit(), maintainerCommit({ sha: "3333333ccccccc", commit: { message: "Merge development" } })] }).status, "pass");
  // Shape of #605: outside author, GitHub-signed web-flow committer, outside and maintainer co-author trailers.
  const result = evaluate({
    commits: [webFlowCommit({ author: "outside-author", message: `Fix\n\nCo-authored-by: X <x@example.test>\nCo-authored-by: Me <${MAINTAINER_NOREPLY}>` })],
  });
  assert.equal(result.status, "failure");
  assert.ok(!result.findings.some((finding) => finding.includes('"web-flow"')));
  assert.ok(result.findings.some((finding) => finding.includes("outside-author")));
  assert.ok(result.findings.some((finding) => finding.includes("x@example.test")));
  assert.ok(result.findings.some((finding) => finding.includes(MAINTAINER_NOREPLY) && finding.includes("the commit author is not a maintainer")));
});
