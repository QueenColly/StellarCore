import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateParticipantData,
  parseClosingIssueNumbers,
  parseCoauthorEmails,
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

test("workflow is read-only, runs trusted default-branch code, and listens for participation changes", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/pr-participant-guard.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /pull_request_review:/);
  assert.match(workflow, /pull_request_review_comment:/);
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
