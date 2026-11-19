import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function failClosed(message) {
  return { status: "inconclusive", findings: [message] };
}

function normalizeLogin(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseClosingIssueNumbers(body = "") {
  const numbers = new Set();
  const pattern = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+(?:https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/)?#?(\d+)\b/gi;
  for (const match of String(body).matchAll(pattern)) numbers.add(Number(match[1]));
  return [...numbers].filter((number) => Number.isSafeInteger(number) && number > 0);
}

// Any line that looks like a co-author attribution, including indented,
// spaced, or case/separator variants. Lines that match this but not the strict
// trailer form below are reported as malformed rather than silently ignored.
const COAUTHOR_CANDIDATE = /^\s*co[\s_-]*authored[\s_-]*by\s*:/i;
// Exactly one "Name <email>" per trailer line, nothing after the address.
const COAUTHOR_TRAILER = /^Co-authored-by:[ \t]*[^<>\r\n]*<([^<>\s]+@[^<>\s]+)>$/i;
const EMAIL_LIKE = /[^\s<>(),;:"'`]+@[^\s<>(),;:"'`]+/g;

export function parseCoauthorTrailers(message = "") {
  const emails = new Set();
  const malformed = [];
  for (const rawLine of String(message).split(/\r?\n/)) {
    const line = rawLine.replace(/[ \t]+$/, "");
    if (!COAUTHOR_CANDIDATE.test(line)) continue;
    const match = line.match(COAUTHOR_TRAILER);
    if (match) {
      emails.add(match[1].trim().toLowerCase());
      continue;
    }
    malformed.push({
      line: line.trim().slice(0, 200),
      emails: [...new Set((line.match(EMAIL_LIKE) ?? []).map((email) => email.toLowerCase()))],
    });
  }
  return { emails: [...emails], malformed };
}

export function parseCoauthorEmails(message = "") {
  return parseCoauthorTrailers(message).emails;
}

function addActor(participants, login, source, extra = {}) {
  if (typeof login !== "string" || !login.trim()) return;
  participants.push({ identity: login.trim(), kind: "login", source, ...extra });
}

function addEmail(participants, email, source, extra = {}) {
  if (typeof email !== "string" || !email.trim()) return;
  participants.push({ identity: email.trim().toLowerCase(), kind: "email", source, ...extra });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// GitHub's web-flow account is accepted only as a committer, only with the
// configured web-flow committer address, and only when GitHub reports a valid
// verified signature (GitHub signs the commits it creates). The commit author
// is still evaluated separately.
function webFlowCommitterStatus(commit, webFlow) {
  if (!isRecord(webFlow) || !webFlow.login || !webFlow.email) return { ok: false, reason: "no web-flow committer is configured" };
  if (normalizeLogin(commit?.committer?.login) !== normalizeLogin(webFlow.login)) return { ok: false, reason: "committer is not web-flow" };
  if (normalizeEmail(commit?.commit?.committer?.email) !== normalizeEmail(webFlow.email)) {
    return { ok: false, reason: "web-flow committer email does not match the approved GitHub web-flow address" };
  }
  const verification = commit?.commit?.verification;
  if (!isRecord(verification) || verification.verified !== true || verification.reason !== "valid") {
    return { ok: false, reason: "web-flow commit lacks a valid verified GitHub signature" };
  }
  return { ok: true };
}

// Maintainer-attested co-author addresses are never trusted on their own. A
// trailer is free text, so the address is accepted for one commit only when the
// authenticated PR author is a maintainer, the PR head is in this repository,
// the commit's GitHub-mapped author is a maintainer, and its committer is a
// maintainer or a verified web-flow committer. These commit identities only
// narrow acceptance; maintainer status itself comes solely from the PR author.
function maintainerAttestation(pull, commit, maintainers, webFlow) {
  if (!maintainers.has(normalizeLogin(pull?.user?.login))) return { ok: false, reason: "the pull request author is not a maintainer" };
  const headRepo = pull?.head?.repo?.full_name;
  const baseRepo = pull?.base?.repo?.full_name;
  if (typeof headRepo !== "string" || typeof baseRepo !== "string") return { ok: false, reason: "head/base repository metadata is unavailable" };
  if (headRepo.toLowerCase() !== baseRepo.toLowerCase()) return { ok: false, reason: "the pull request head is not in this repository" };
  if (!commit?.author?.login) return { ok: false, reason: "the commit author is not mapped to a GitHub account" };
  if (!maintainers.has(normalizeLogin(commit.author.login))) return { ok: false, reason: "the commit author is not a maintainer" };
  if (!commit?.committer?.login) return { ok: false, reason: "the commit committer is not mapped to a GitHub account" };
  if (!maintainers.has(normalizeLogin(commit.committer.login)) && !webFlowCommitterStatus(commit, webFlow).ok) {
    return { ok: false, reason: "the commit committer is neither a maintainer nor a verified web-flow committer" };
  }
  return { ok: true };
}

const CONFIG_LIST_KEYS = ["maintainers", "approvedBots", "approvedCommitEmails", "approvedCoauthorEmails", "maintainerAttestedCoauthorEmails", "approvedReviewerTeams", "exceptions"];

function configProblem(config) {
  if (!isRecord(config)) return "the guard configuration is not an object";
  for (const key of CONFIG_LIST_KEYS) {
    if (config[key] !== undefined && !Array.isArray(config[key])) return `configuration field ${key} must be a list`;
  }
  for (const key of CONFIG_LIST_KEYS.filter((name) => name !== "exceptions")) {
    if ((config[key] ?? []).some((value) => typeof value !== "string" || !value.trim())) return `configuration field ${key} must contain only non-empty strings`;
  }
  if (config.verifiedWebFlowCommitter !== undefined) {
    const webFlow = config.verifiedWebFlowCommitter;
    if (!isRecord(webFlow) || typeof webFlow.login !== "string" || !webFlow.login.trim() || typeof webFlow.email !== "string" || !webFlow.email.includes("@")) {
      return "configuration field verifiedWebFlowCommitter must have a login and an email";
    }
  }
  return "";
}

function collectParticipants({ pull, comments, reviews, reviewComments, commits, issueEvents, eventPayload }) {
  const participants = [];
  addActor(participants, pull.user?.login, "pull request author");
  if (eventPayload?.action === "deleted" && eventPayload.comment?.user?.login) {
    addActor(participants, eventPayload.comment.user.login, "deleted comment event payload");
  }
  if (["review_requested", "review_request_removed"].includes(eventPayload?.action)) {
    addActor(participants, eventPayload.sender?.login, `reviewer change requester (${eventPayload.action})`);
    addActor(participants, eventPayload.requested_reviewer?.login, `reviewer target (${eventPayload.action})`);
    if (eventPayload.requested_team?.slug) {
      participants.push({
        identity: eventPayload.requested_team.slug,
        kind: "team",
        source: `reviewer team target (${eventPayload.action})`,
      });
    }
  }

  for (const item of comments) addActor(participants, item.user?.login, "conversation comment");
  for (const item of reviews) addActor(participants, item.user?.login, "submitted review");
  for (const item of reviewComments) addActor(participants, item.user?.login, "inline review comment");

  for (const item of commits) {
    const short = item.sha?.slice(0, 7) ?? "unknown commit";
    addActor(participants, item.author?.login, `commit author (${short})`);
    if (!item.author?.login) addEmail(participants, item.commit?.author?.email, `unmapped commit author email (${short})`);
    addActor(participants, item.committer?.login, `commit committer (${short})`, { role: "committer", commit: item });
    if (!item.committer?.login) addEmail(participants, item.commit?.committer?.email, `unmapped commit committer email (${short})`);
    const trailers = parseCoauthorTrailers(item.commit?.message);
    for (const email of trailers.emails) {
      addEmail(participants, email, `Co-authored-by trailer (${short})`, { role: "coauthor", commit: item });
    }
    for (const entry of trailers.malformed) {
      participants.push({
        identity: entry.line,
        kind: "malformed-trailer",
        source: `commit message (${short})${entry.emails.length ? `; addresses: ${entry.emails.join(", ")}` : ""}`,
      });
    }
  }

  for (const event of issueEvents) {
    if (event.event === "review_requested" || event.event === "review_request_removed") {
      addActor(participants, event.actor?.login, `reviewer change requester (${event.event})`);
      addActor(participants, event.requested_reviewer?.login, `reviewer target (${event.event})`);
      if (event.requested_team?.slug) {
        participants.push({
          identity: event.requested_team.slug,
          kind: "team",
          source: `reviewer team target (${event.event})`,
        });
      }
    }
  }

  for (const reviewer of pull.requested_reviewers ?? []) {
    addActor(participants, reviewer.login, "currently requested reviewer");
  }
  for (const team of pull.requested_teams ?? []) {
    if (team.slug) participants.push({ identity: team.slug, kind: "team", source: "currently requested reviewer team" });
  }

  return participants;
}

function validException(exception, participant, now) {
  if (!isRecord(exception) || !exception.login || !exception.reason || !exception.expiresAt) return false;
  if (Date.parse(exception.expiresAt) <= now || !Number.isFinite(Date.parse(exception.expiresAt))) return false;
  return participant.kind === "login"
    && normalizeLogin(exception.login) === normalizeLogin(participant.identity);
}

export function evaluateParticipantData(data, config, now = Date.now()) {
  const findings = [];
  const problem = configProblem(config);
  if (problem) return failClosed(`Invalid participant-guard configuration: ${problem}.`);
  if (!isRecord(data?.pull)) return failClosed("Pull request data is incomplete.");

  const maintainers = new Set((config.maintainers ?? []).map(normalizeLogin));
  const linkedIssues = parseClosingIssueNumbers(data.pull.body ?? "");
  const assignedLogins = new Set();
  let mode = "linked-issue";

  if (linkedIssues.length === 0) {
    // Narrow maintainer exemption: only the authenticated PR author can make a
    // PR maintainer-authored. All participants are still evaluated below, just
    // without assignee logins.
    const author = normalizeLogin(data.pull.user?.login);
    if (!author || !maintainers.has(author)) {
      return failClosed("No closing reference to an issue was found in the pull request body; contributor assignment cannot be verified.");
    }
    mode = "maintainer";
  } else {
    for (const issue of data.linkedIssues ?? []) {
      if (!issue || !Number.isSafeInteger(issue.number) || !Array.isArray(issue.assignees)) {
        return failClosed("Linked issue data is incomplete; assignment could not be verified.");
      }
      for (const assignee of issue.assignees) {
        if (assignee?.login) assignedLogins.add(normalizeLogin(assignee.login));
      }
    }

    const returnedIssueNumbers = new Set((data.linkedIssues ?? []).map((issue) => issue.number));
    const missingIssues = linkedIssues.filter((number) => !returnedIssueNumbers.has(number));
    if (missingIssues.length) {
      return failClosed(`Linked issue data is missing for: ${missingIssues.map((n) => `#${n}`).join(", ")}.`);
    }
    if (assignedLogins.size === 0) {
      return failClosed("The linked issue(s) have no assignees; contributor identity cannot be verified.");
    }
  }

  const approvedBots = new Set((config.approvedBots ?? []).map(normalizeLogin));
  const approvedCoauthorEmails = new Set((config.approvedCoauthorEmails ?? []).map(normalizeEmail));
  const attestedCoauthorEmails = new Set((config.maintainerAttestedCoauthorEmails ?? []).map(normalizeEmail));
  const approvedCommitEmails = new Set((config.approvedCommitEmails ?? []).map(normalizeEmail));
  const allowedLogins = new Set([...maintainers, ...assignedLogins, ...approvedBots]);
  const webFlow = config.verifiedWebFlowCommitter;
  const participants = collectParticipants(data);

  for (const participant of participants) {
    let allowed = false;
    let detail = "";
    if (participant.kind === "malformed-trailer") {
      detail = "attribution is not in the exact `Co-authored-by: Name <email>` form, so it cannot be verified";
    } else if (participant.kind === "email" && participant.role === "coauthor") {
      allowed = approvedCoauthorEmails.has(participant.identity);
      if (!allowed && attestedCoauthorEmails.has(participant.identity)) {
        const attestation = maintainerAttestation(data.pull, participant.commit, maintainers, webFlow);
        allowed = attestation.ok;
        if (!allowed) detail = `maintainer attestation not satisfied: ${attestation.reason}`;
      }
    } else if (participant.kind === "email") {
      allowed = approvedCommitEmails.has(participant.identity);
    } else if (participant.kind === "team") {
      allowed = (config.approvedReviewerTeams ?? []).map((team) => String(team).toLowerCase()).includes(participant.identity.toLowerCase());
    } else {
      allowed = allowedLogins.has(normalizeLogin(participant.identity));
      if (!allowed && participant.role === "committer" && webFlow && normalizeLogin(participant.identity) === normalizeLogin(webFlow.login)) {
        const status = webFlowCommitterStatus(participant.commit, webFlow);
        allowed = status.ok;
        if (!allowed) detail = status.reason;
      }
    }

    const excepted = participant.kind !== "malformed-trailer" &&
      (config.exceptions ?? []).some((exception) => validException(exception, participant, now));
    if (!allowed && !excepted) {
      const label = participant.kind === "malformed-trailer" ? "Malformed or unrecognized Co-authored-by attribution" : `Unexpected ${participant.kind}`;
      findings.push(`${label} "${participant.identity}" in ${participant.source}${detail ? ` (${detail})` : ""}.`);
    }
  }

  const uniqueFindings = [...new Set(findings)];
  return {
    status: uniqueFindings.length ? "failure" : "pass",
    findings: uniqueFindings,
    mode,
    linkedIssues,
    assignedContributors: [...assignedLogins].sort(),
    participantCount: participants.length,
  };
}

async function readJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "stellarcore-pr-participant-guard",
    },
  });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${url}`);
  const body = await response.json();
  return { body, link: response.headers.get("link") };
}

export async function readAllPages(url, token) {
  const items = [];
  let next = url;
  let pages = 0;
  while (next) {
    pages += 1;
    if (pages > MAX_PAGES) throw new Error(`Pagination exceeded ${MAX_PAGES} pages for ${url}`);
    const { body, link } = await readJson(next, token);
    if (!Array.isArray(body)) throw new Error(`Expected an array response from ${next}`);
    items.push(...body);
    const nextLink = link?.split(",").map((part) => part.trim()).find((part) => /rel="next"/.test(part));
    next = nextLink?.match(/<([^>]+)>/)?.[1] ?? "";
    if (!link && body.length === PAGE_SIZE) {
      throw new Error(`Pagination response omitted Link header for full page from ${url}`);
    }
  }
  return items;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const pullNumber = process.env.PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !/^\d+$/.test(pullNumber ?? "") || !token) {
    throw new Error("GITHUB_REPOSITORY, numeric PR_NUMBER, and GITHUB_TOKEN are required.");
  }

  const configPath = new URL("../../.github/pr-participant-guard.json", import.meta.url);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const eventPayloadPath = process.env.GITHUB_EVENT_PATH;
  const eventPayload = eventPayloadPath ? JSON.parse(await readFile(eventPayloadPath, "utf8")) : {};
  const api = `${API_ROOT}/repos/${repository}`;
  const { body: pull } = await readJson(`${api}/pulls/${pullNumber}`, token);
  if (!pull || !pull.user) {
    throw new Error("Pull request response is incomplete.");
  }

  pull.requested_reviewers ??= [];
  const issueNumbers = parseClosingIssueNumbers(pull.body ?? "");
  const [comments, reviews, reviewComments, commits, issueEvents] = await Promise.all([
    readAllPages(`${api}/issues/${pullNumber}/comments?per_page=${PAGE_SIZE}`, token),
    readAllPages(`${api}/pulls/${pullNumber}/reviews?per_page=${PAGE_SIZE}`, token),
    readAllPages(`${api}/pulls/${pullNumber}/comments?per_page=${PAGE_SIZE}`, token),
    readAllPages(`${api}/pulls/${pullNumber}/commits?per_page=${PAGE_SIZE}`, token),
    readAllPages(`${api}/issues/${pullNumber}/timeline?per_page=${PAGE_SIZE}`, token),
  ]);
  const linkedIssues = await Promise.all(issueNumbers.map(async (number) => {
    const { body } = await readJson(`${api}/issues/${number}`, token);
    if (body.number !== number || !Array.isArray(body.assignees)) throw new Error(`Issue #${number} response is incomplete.`);
    return { number, assignees: body.assignees };
  }));

  const result = evaluateParticipantData({ pull, comments, reviews, reviewComments, commits, issueEvents, linkedIssues, eventPayload }, config);
  console.log(`PR Participant Guard: ${result.status.toUpperCase()}`);
  for (const finding of result.findings) console.log(`- ${finding}`);
  if (result.status !== "pass") process.exitCode = 1;
  else if (result.mode === "maintainer") console.log(`Reviewed ${result.participantCount} participation records for a maintainer-authored pull request without a linked issue.`);
  else console.log(`Reviewed ${result.participantCount} participation records across linked issue(s): ${result.linkedIssues.map((n) => `#${n}`).join(", ")}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`PR Participant Guard: INCONCLUSIVE — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
