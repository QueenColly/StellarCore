import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateParticipantData,
  parseClosingIssueNumbers,
  readAllPages,
} from "../../scripts/security/check-pr-participants.mjs";

const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const MAINTAINER = "Aboyeji-Isaac";
const MAINTAINER_ID = 141873116;
const WEB_FLOW_EMAIL = "noreply@github.com";
const CLAUDE_ADDRESS = "noreply@anthropic.com";
const CODEBUFF_ADDRESS = "noreply@codebuff.com";
const COPILOT_ADDRESS = "223556219+copilot@users.noreply.github.com";

const config = {
  maintainers: [MAINTAINER],
  verifiedWebFlowCommitter: { login: "web-flow", email: WEB_FLOW_EMAIL },
  exceptions: [
    { login: "temporary-reviewer", reason: "approved incident review", expiresAt: "2099-01-01T00:00:00.000Z" },
    { login: "expired-reviewer", reason: "old exception", expiresAt: "2020-01-01T00:00:00.000Z" },
  ],
};

function human(login, id = 1000) {
  return { login, id, type: "User" };
}

function bot(login, id = 2000) {
  return { login, id, type: "Bot" };
}

function commit({ sha = "1111111aaaaaaa", author = human(MAINTAINER, MAINTAINER_ID), committer = human(MAINTAINER, MAINTAINER_ID), message = "security: change", committerEmail = `${MAINTAINER_ID}+aboyeji-isaac@users.noreply.github.com`, verification = { verified: false, reason: "unsigned" } } = {}) {
  return { sha, author, committer, commit: { message, committer: { email: committerEmail }, verification } };
}

function webFlowCommit({ verified = true, reason = "valid", email = WEB_FLOW_EMAIL, author = human(MAINTAINER, MAINTAINER_ID), message = "Merge pull request #1" } = {}) {
  return {
    sha: "2222222bbbbbbb",
    author,
    committer: { login: "web-flow", id: 19864447, type: "User" },
    commit: { message, committer: { email }, verification: { verified, reason } },
  };
}

// A maintainer-authored pull request with no linked issue (maintainer mode).
function maintainerPr(overrides = {}) {
  return {
    pull: { body: "Maintenance change without an issue.", user: human(MAINTAINER, MAINTAINER_ID), requested_reviewers: [], requested_teams: [] },
    comments: [],
    reviews: [],
    reviewComments: [],
    commits: [commit()],
    issueEvents: [],
    linkedIssues: [],
    ...overrides,
  };
}

// A contributor pull request that links an issue the contributor is assigned to.
function contributorPr(overrides = {}) {
  return {
    pull: { body: "Implements the feature. Closes #42", user: human("assigned-contributor", 3001), requested_reviewers: [], requested_teams: [] },
    comments: [],
    reviews: [],
    reviewComments: [],
    commits: [commit({ author: human("assigned-contributor", 3001), committer: human("assigned-contributor", 3001) })],
    issueEvents: [],
    linkedIssues: [{ number: 42, assignees: [{ login: "assigned-contributor" }] }],
    ...overrides,
  };
}

const evaluateMaintainer = (overrides) => evaluateParticipantData(maintainerPr(overrides), config, NOW);
const evaluateContributor = (overrides) => evaluateParticipantData(contributorPr(overrides), config, NOW);

test("parses closing issue references and deduplicates them", () => {
  assert.deepEqual(parseClosingIssueNumbers("Closes #12 and fixes #13, resolves #12"), [12, 13]);
  assert.deepEqual(parseClosingIssueNumbers("closed https://github.com/org/repo/issues/77"), [77]);
  assert.deepEqual(parseClosingIssueNumbers("Related to #99"), []);
  assert.deepEqual(parseClosingIssueNumbers(""), []);
});

// 1. Authorized maintainer.

test("maintainer-authored pull request without a linked issue passes", () => {
  const result = evaluateMaintainer();
  assert.equal(result.status, "pass");
  assert.equal(result.mode, "maintainer");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.uncertainties, []);
  assert.equal(result.unauthorizedHumanCount, 0);
});

test("the maintainer is authorized in every participation role", () => {
  const maintainer = human(MAINTAINER, MAINTAINER_ID);
  const result = evaluateMaintainer({
    comments: [{ user: maintainer }],
    reviews: [{ user: maintainer }],
    reviewComments: [{ user: maintainer }],
    commits: [commit(), webFlowCommit()],
    pull: { body: "Maintenance change.", user: maintainer, requested_reviewers: [maintainer], requested_teams: [] },
    issueEvents: [{ event: "review_requested", actor: maintainer, requested_reviewer: maintainer }],
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

test("maintainer recognition is case-insensitive and comes only from the authenticated login", () => {
  assert.equal(evaluateParticipantData(maintainerPr({
    pull: { body: "No issue.", user: human("aboyeji-isaac", MAINTAINER_ID), requested_reviewers: [], requested_teams: [] },
  }), config, NOW).status, "pass");
  // A commit identity can never make a pull request maintainer-authored.
  const impostor = evaluateParticipantData(maintainerPr({
    pull: { body: "No issue.", user: human("outsider", 9001), requested_reviewers: [], requested_teams: [] },
    commits: [commit()],
  }), config, NOW);
  assert.equal(impostor.status, "inconclusive");
  assert.match(impostor.findings[0], /No closing reference to an issue was found/);
});

// 2. Assigned contributors.

test("a contributor assigned to the linked issue passes", () => {
  const result = evaluateContributor();
  assert.equal(result.status, "pass");
  assert.equal(result.mode, "linked-issue");
  assert.deepEqual(result.assignedContributors, ["assigned-contributor"]);
});

test("assignees of every linked issue are authorized, and the maintainer may join", () => {
  const result = evaluateContributor({
    pull: { body: "Closes #42, fixes #43", user: human("assigned-contributor", 3001), requested_reviewers: [], requested_teams: [] },
    comments: [{ user: human(MAINTAINER, MAINTAINER_ID) }, { user: human("second-assignee", 3002) }],
    reviews: [{ user: human(MAINTAINER, MAINTAINER_ID) }],
    linkedIssues: [
      { number: 42, assignees: [{ login: "assigned-contributor" }] },
      { number: 43, assignees: [{ login: "second-assignee" }] },
    ],
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.assignedContributors, ["assigned-contributor", "second-assignee"]);
});

// 3. Unrestricted agents and bots.

test("any GitHub account of type Bot is permitted without individual approval", () => {
  const bots = [bot("github-actions[bot]", 41898282), bot("drips-wave[bot]", 253720017), bot("Copilot", 223556219), bot("never-seen-before[bot]", 999999)];
  for (const account of bots) {
    const result = evaluateMaintainer({
      comments: [{ user: account }],
      reviews: [{ user: account }],
      reviewComments: [{ user: account }],
      commits: [commit({ sha: "4444444dddddd", author: account, committer: account })],
      pull: { body: "Maintenance change.", user: human(MAINTAINER, MAINTAINER_ID), requested_reviewers: [account], requested_teams: [] },
      issueEvents: [{ event: "review_requested", actor: account, requested_reviewer: account }],
    });
    assert.equal(result.status, "pass", `${account.login}: ${JSON.stringify(result.findings)}`);
    assert.deepEqual(result.uncertainties, [], account.login);
    assert.ok(result.machineRecords >= 7, `${account.login} machineRecords=${result.machineRecords}`);
  }
});

test("bot participation is permitted in contributor pull requests too", () => {
  const result = evaluateContributor({ comments: [{ user: bot("drips-wave[bot]", 253720017) }] });
  assert.equal(result.status, "pass");
  assert.equal(result.machineRecords, 1);
});

test("a configured verified web-flow committer is permitted; an unverified one is an uncertainty, not a human", () => {
  assert.equal(evaluateMaintainer({ commits: [webFlowCommit()] }).status, "pass");

  for (const [broken, reason] of [
    [webFlowCommit({ verified: false, reason: "unsigned" }), "valid verified GitHub signature"],
    [webFlowCommit({ verified: true, reason: "expired_key" }), "valid verified GitHub signature"],
    [webFlowCommit({ email: "attacker@example.test" }), "does not match the approved GitHub web-flow address"],
  ]) {
    const result = evaluateMaintainer({ commits: [broken] });
    assert.equal(result.status, "pass", JSON.stringify(result.findings));
    assert.equal(result.unauthorizedHumanCount, 0);
    assert.ok(result.uncertainties.some((note) => note.includes("web-flow") && note.includes(reason)), `${reason}: ${JSON.stringify(result.uncertainties)}`);
  }

  // web-flow outside the committer role is still evaluated as an ordinary account.
  const asAuthor = evaluateMaintainer({ commits: [webFlowCommit({ author: { login: "web-flow", id: 19864447, type: "User" } })] });
  assert.equal(asAuthor.status, "failure");
  assert.equal(asAuthor.unauthorizedHumanCount, 1);
  // A verified web-flow committer never excuses the commit author.
  const outsideAuthor = evaluateMaintainer({ commits: [webFlowCommit({ author: human("outside-author", 7001) })] });
  assert.equal(outsideAuthor.status, "failure");
  assert.equal(outsideAuthor.findings.length, 1);
  assert.ok(outsideAuthor.findings[0].includes("outside-author"));
});

// 4. Co-author trailers are not participants.

test("co-author trailers, including AI agent attribution, are never treated as participants", () => {
  const messages = [
    `security: change\n\nCo-authored-by: Claude Opus 5.5 <${CLAUDE_ADDRESS}>`,
    `security: change\n\nCo-authored-by: Codebuff <${CODEBUFF_ADDRESS}>`,
    `security: change\n\nCo-authored-by: Copilot <${COPILOT_ADDRESS}>`,
    "security: change\n\nCo-authored-by: chokpala <your_email_used_on_platform>",
    "security: change\n\n  co-authored_By : Someone <someone@example.test> (pairing)",
    `security: change\n\nCo-authored-by: A <a@example.test>\nCo-authored-by: B <b@example.test>`,
  ];
  for (const message of messages) {
    const result = evaluateMaintainer({ commits: [commit({ message })] });
    assert.equal(result.status, "pass", `${message}: ${JSON.stringify(result.findings)}`);
    assert.deepEqual(result.findings, [], message);
    assert.deepEqual(result.uncertainties, [], message);
  }
});

test("contributors are not restricted by which coding agent their commits credit", () => {
  const result = evaluateContributor({
    commits: [commit({
      author: human("assigned-contributor", 3001),
      committer: human("assigned-contributor", 3001),
      message: `feat: add feature\n\nCo-authored-by: Claude <${CLAUDE_ADDRESS}>\nCo-authored-by: Copilot <${COPILOT_ADDRESS}>`,
    })],
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
});

// 5. Unauthorized humans, deduplicated per authenticated account.

test("an unauthorized human is reported once, however many records they produce", () => {
  const stranger = human("Stranger", 8001);
  const result = evaluateMaintainer({
    comments: [{ user: stranger }],
    reviews: [{ user: stranger }],
    commits: [
      commit({ sha: "aaaaaaa1111111", author: stranger, committer: stranger }),
      commit({ sha: "bbbbbbb2222222", author: stranger, committer: stranger }),
      commit({ sha: "ccccccc3333333", author: stranger, committer: stranger }),
    ],
  });
  assert.equal(result.status, "failure");
  assert.equal(result.findings.length, 1);
  assert.equal(result.unauthorizedHumanCount, 1);
  const [finding] = result.findings;
  assert.ok(finding.startsWith('Unauthorized human participant "Stranger" (account 8001)'), finding);
  assert.ok(finding.includes("neither a configured maintainer nor an assignee of a linked issue"), finding);
  assert.ok(/and \d+ further records/.test(finding), finding);
});

test("distinct unauthorized humans are counted distinctly", () => {
  const result = evaluateMaintainer({
    comments: [{ user: human("first-stranger", 8002) }, { user: human("second-stranger", 8003) }],
  });
  assert.equal(result.status, "failure");
  assert.equal(result.unauthorizedHumanCount, 2);
  assert.equal(result.findings.length, 2);
});

test("case variants of one account are a single participant", () => {
  const result = evaluateMaintainer({
    comments: [{ user: human("Stranger", 8001) }, { user: human("stranger", 8001) }],
  });
  assert.equal(result.unauthorizedHumanCount, 1);
});

test("an unassigned human in a contributor pull request fails", () => {
  const result = evaluateContributor({
    commits: [commit({ author: human("unassigned-helper", 8004), committer: human("unassigned-helper", 8004) })],
  });
  assert.equal(result.status, "failure");
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].includes("unassigned-helper"));
});

test("new unauthorized participation turns a passing result into a failure", () => {
  assert.equal(evaluateContributor().status, "pass");
  assert.equal(evaluateContributor({ comments: [{ user: human("newcomer", 8005) }] }).status, "failure");
});

test("an active documented exception passes but an expired one does not", () => {
  assert.equal(evaluateMaintainer({ comments: [{ user: human("temporary-reviewer", 8006) }] }).status, "pass");
  assert.equal(evaluateMaintainer({ comments: [{ user: human("expired-reviewer", 8007) }] }).status, "failure");
  for (const broken of [{ login: "x" }, { login: "x", reason: "r" }, { login: "x", reason: "r", expiresAt: "not-a-date" }]) {
    const result = evaluateParticipantData(maintainerPr({ comments: [{ user: human("x", 8008) }] }), { ...config, exceptions: [broken] }, NOW);
    assert.equal(result.status, "failure", JSON.stringify(broken));
  }
});

// 6. Missing issue references and incomplete linked-issue data.

test("a contributor pull request without a closing reference is inconclusive", () => {
  const result = evaluateParticipantData(contributorPr({
    pull: { body: "Related to #42 only.", user: human("assigned-contributor", 3001), requested_reviewers: [], requested_teams: [] },
    linkedIssues: [],
  }), config, NOW);
  assert.equal(result.status, "inconclusive");
  assert.match(result.findings[0], /No closing reference to an issue was found/);
});

test("missing assignment or incomplete linked issue data is inconclusive", () => {
  assert.equal(evaluateContributor({ linkedIssues: [{ number: 42, assignees: [] }] }).status, "inconclusive");
  assert.equal(evaluateContributor({ linkedIssues: [{ number: 42, assignees: null }] }).status, "inconclusive");
  assert.equal(evaluateContributor({ linkedIssues: [] }).status, "inconclusive");
  assert.match(evaluateContributor({ linkedIssues: [] }).findings[0], /Linked issue data is missing for: #42/);
});

// 7. Ambiguous identities are non-failing uncertainties.

test("an unmapped commit author or committer is an uncertainty, never an invented human", () => {
  const result = evaluateMaintainer({
    commits: [{
      sha: "5555555eeeeee",
      author: null,
      committer: null,
      commit: { message: "security: change", author: { email: "stranger@example.test" }, committer: { email: "stranger@example.test" } },
    }],
  });
  assert.equal(result.status, "pass");
  assert.equal(result.unauthorizedHumanCount, 0);
  assert.equal(result.uncertainties.length, 2);
  assert.ok(result.uncertainties.every((note) => note.includes("5555555") && note.includes("not mapped to a GitHub account")));
  assert.ok(!JSON.stringify(result.uncertainties).includes("stranger@example.test"), "an unauthenticated email is not reported as an identity");
});

test("an unrecognized or missing account type is an uncertainty", () => {
  for (const type of [undefined, null, "Organization", "Mannequin"]) {
    const result = evaluateMaintainer({ comments: [{ user: { login: "ambiguous-account", id: 8009, type } }] });
    assert.equal(result.status, "pass", JSON.stringify(type));
    assert.equal(result.unauthorizedHumanCount, 0);
    assert.equal(result.uncertainties.length, 1);
    assert.ok(result.uncertainties[0].includes("ambiguous-account") && result.uncertainties[0].includes("could not be established"));
  }
});

test("a participation record without a login is an uncertainty", () => {
  const result = evaluateMaintainer({ comments: [{ user: { id: 8010, type: "User" } }] });
  assert.equal(result.status, "pass");
  assert.equal(result.uncertainties.length, 1);
  assert.match(result.uncertainties[0], /carries no GitHub login/);
});

test("requested reviewer teams are not treated as participants", () => {
  const result = evaluateMaintainer({
    pull: {
      body: "Maintenance change.",
      user: human(MAINTAINER, MAINTAINER_ID),
      requested_reviewers: [],
      requested_teams: [{ slug: "core-reviewers" }],
    },
    issueEvents: [{ event: "review_requested", actor: human(MAINTAINER, MAINTAINER_ID), requested_team: { slug: "core-reviewers" } }],
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.uncertainties, []);
});

// 8. Event payload coverage.

test("reviewer-change and deleted-comment payloads are evaluated immediately", () => {
  const requested = evaluateMaintainer({
    eventPayload: { action: "review_requested", sender: human("outside-requester", 8011), requested_reviewer: human("outside-target", 8012) },
  });
  assert.equal(requested.status, "failure");
  assert.equal(requested.unauthorizedHumanCount, 2);

  const deleted = evaluateMaintainer({
    eventPayload: { action: "deleted", comment: { user: human("deleted-commenter", 8013) } },
  });
  assert.equal(deleted.status, "failure");
  assert.ok(deleted.findings[0].includes("deleted-commenter"));

  // A bot doing the same is permitted.
  assert.equal(evaluateMaintainer({
    eventPayload: { action: "review_requested", sender: bot("github-actions[bot]", 41898282), requested_reviewer: bot("Copilot", 223556219) },
  }).status, "pass");
});

// 9. Configuration and workflow contracts.

test("invalid guard configuration fails closed", () => {
  for (const bad of [
    null,
    "config",
    { ...config, maintainers: [42] },
    { ...config, maintainers: [""] },
    { ...config, maintainers: "Aboyeji-Isaac" },
    { ...config, exceptions: {} },
    { ...config, verifiedWebFlowCommitter: { login: "web-flow" } },
    { ...config, verifiedWebFlowCommitter: "web-flow" },
  ]) {
    const result = evaluateParticipantData(maintainerPr(), bad, NOW);
    assert.equal(result.status, "inconclusive", JSON.stringify(bad));
    assert.match(result.findings[0], /Invalid participant-guard configuration/);
  }
  assert.equal(evaluateParticipantData({ pull: null }, config, NOW).status, "inconclusive");
});

test("repository configuration lists only maintainers, web-flow, and exceptions", async () => {
  const repoConfig = JSON.parse(await readFile(new URL("../../.github/pr-participant-guard.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(repoConfig).sort(), ["exceptions", "maintainers", "verifiedWebFlowCommitter"]);
  assert.deepEqual(repoConfig.maintainers, [MAINTAINER]);
  assert.deepEqual(repoConfig.exceptions, []);
  assert.deepEqual(repoConfig.verifiedWebFlowCommitter, { login: "web-flow", email: WEB_FLOW_EMAIL });
  // No agent allowlist, co-author allowlist, or attestation mechanism remains.
  for (const removed of ["approvedBots", "approvedCommitEmails", "approvedCoauthorEmails", "maintainerAttestedCoauthorEmails", "approvedReviewerTeams"]) {
    assert.equal(repoConfig[removed], undefined, removed);
  }
  const serialized = JSON.stringify(repoConfig).toLowerCase();
  for (const address of ["anthropic", "codebuff", "copilot"]) {
    assert.ok(!serialized.includes(address), `${address} must not appear in the guard configuration`);
  }
});

test("the repository configuration makes real maintainer and contributor shapes pass", async () => {
  const repoConfig = JSON.parse(await readFile(new URL("../../.github/pr-participant-guard.json", import.meta.url), "utf8"));
  // Shape of #613/#614: maintainer-authored, no linked issue, AI co-author trailer, web-flow merge commit.
  const maintainerShape = evaluateParticipantData(maintainerPr({
    commits: [commit({ message: `security: change\n\nCo-authored-by: Claude Opus 5.5 <${CLAUDE_ADDRESS}>` }), webFlowCommit()],
  }), repoConfig, NOW);
  assert.equal(maintainerShape.status, "pass");
  assert.deepEqual(maintainerShape.findings, []);

  // Shape of #619: assigned contributor plus the Wave program bot.
  const contributorShape = evaluateParticipantData(contributorPr({
    comments: [{ user: bot("drips-wave[bot]", 253720017) }],
  }), repoConfig, NOW);
  assert.equal(contributorShape.status, "pass");

  // Shape of #605: a branch synchronization carrying other contributors' commits.
  const syncShape = evaluateParticipantData(maintainerPr({
    commits: [
      webFlowCommit({ author: human("ollypee22", 307573989) }),
      webFlowCommit({ author: human("Widadullahi", 156221762) }),
      webFlowCommit({ author: human("Widadullahi", 156221762) }),
    ],
  }), repoConfig, NOW);
  assert.equal(syncShape.status, "failure");
  assert.equal(syncShape.unauthorizedHumanCount, 2);
});

test("workflow is read-only, runs only trusted pull_request_target events, and uses default-branch code", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/pr-participant-guard.yml", import.meta.url), "utf8");
  assert.match(workflow, /\non:\n  pull_request_target:\n    branches: \[contributions, development, main\]\n    types: \[opened, reopened, synchronize, ready_for_review, edited, review_requested, review_request_removed\]\n\n/);
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

test("the guard is advisory and is not one of the required status checks", async () => {
  const { REQUIRED_STATUS_CHECKS } = await import("../../scripts/security/pr-malware-core.mjs");
  assert.deepEqual(REQUIRED_STATUS_CHECKS.map((check) => check.name), ["Scan untrusted PR changes", "Lint, typecheck, test, build"]);
  assert.ok(!REQUIRED_STATUS_CHECKS.some((check) => check.name === "PR Participant Guard"));
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
