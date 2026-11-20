import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_REPORTED_SOURCES = 3;

function failClosed(message) {
  return { status: "inconclusive", findings: [message], uncertainties: [] };
}

function normalizeLogin(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeEmail(value) {
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

// Every participation record is an account GitHub authenticated: a login the
// API returned together with its numeric id and account type. Commit message
// text, commit author/committer email addresses, and `Co-authored-by` trailers
// are never read as identities, because nothing authenticates them.
function addAccount(accounts, user, source, extra = {}) {
  if (!isRecord(user)) return;
  accounts.push({
    login: typeof user.login === "string" ? user.login.trim() : "",
    id: user.id,
    type: user.type,
    source,
    ...extra,
  });
}

// GitHub's web-flow account is accepted only as a committer, only with the
// configured web-flow committer address, and only when GitHub reports a valid
// verified signature (GitHub signs the commits it creates). The commit author
// is still evaluated separately.
function webFlowCommitterStatus(commit, webFlow) {
  if (!isRecord(webFlow) || !webFlow.login || !webFlow.email) return { ok: false, reason: "no web-flow committer is configured" };
  if (normalizeEmail(commit?.commit?.committer?.email) !== normalizeEmail(webFlow.email)) {
    return { ok: false, reason: "web-flow committer email does not match the approved GitHub web-flow address" };
  }
  const verification = commit?.commit?.verification;
  if (!isRecord(verification) || verification.verified !== true || verification.reason !== "valid") {
    return { ok: false, reason: "web-flow commit lacks a valid verified GitHub signature" };
  }
  return { ok: true };
}

const CONFIG_LIST_KEYS = ["maintainers", "exceptions"];

function configProblem(config) {
  if (!isRecord(config)) return "the guard configuration is not an object";
  for (const key of CONFIG_LIST_KEYS) {
    if (config[key] !== undefined && !Array.isArray(config[key])) return `configuration field ${key} must be a list`;
  }
  if ((config.maintainers ?? []).some((value) => typeof value !== "string" || !value.trim())) {
    return "configuration field maintainers must contain only non-empty strings";
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
  const accounts = [];
  const unmapped = [];
  addAccount(accounts, pull.user, "pull request author");
  if (eventPayload?.action === "deleted") {
    addAccount(accounts, eventPayload.comment?.user, "deleted comment event payload");
  }
  if (["review_requested", "review_request_removed"].includes(eventPayload?.action)) {
    addAccount(accounts, eventPayload.sender, `reviewer change requester (${eventPayload.action})`);
    addAccount(accounts, eventPayload.requested_reviewer, `reviewer target (${eventPayload.action})`);
  }

  for (const item of comments) addAccount(accounts, item.user, "conversation comment");
  for (const item of reviews) addAccount(accounts, item.user, "submitted review");
  for (const item of reviewComments) addAccount(accounts, item.user, "inline review comment");

  for (const item of commits) {
    const short = item.sha?.slice(0, 7) ?? "unknown commit";
    if (isRecord(item.author)) addAccount(accounts, item.author, `commit author (${short})`, { role: "author", commit: item });
    else unmapped.push(`The commit author of ${short} is not mapped to a GitHub account, so no authenticated identity could be established.`);
    if (isRecord(item.committer)) addAccount(accounts, item.committer, `commit committer (${short})`, { role: "committer", commit: item });
    else unmapped.push(`The commit committer of ${short} is not mapped to a GitHub account, so no authenticated identity could be established.`);
  }

  for (const event of issueEvents) {
    if (event.event === "review_requested" || event.event === "review_request_removed") {
      addAccount(accounts, event.actor, `reviewer change requester (${event.event})`);
      addAccount(accounts, event.requested_reviewer, `reviewer target (${event.event})`);
    }
  }

  for (const reviewer of pull.requested_reviewers ?? []) {
    addAccount(accounts, reviewer, "currently requested reviewer");
  }
  // Requested reviewer teams are not authenticated human identities. Members of
  // a requested team are evaluated individually when they actually participate.

  return { accounts, unmapped };
}

function validException(exception, login, now) {
  if (!isRecord(exception) || !exception.login || !exception.reason || !exception.expiresAt) return false;
  const expiresAt = Date.parse(exception.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return normalizeLogin(exception.login) === login;
}

export function evaluateParticipantData(data, config, now = Date.now()) {
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

  const authorizedHumans = new Set([...maintainers, ...assignedLogins]);
  const webFlow = config.verifiedWebFlowCommitter;
  const { accounts, unmapped } = collectParticipants(data);
  const uncertainties = [...unmapped];
  // Unauthorized humans are counted per authenticated account, not per record.
  const unauthorized = new Map();
  let machineRecords = 0;

  for (const account of accounts) {
    const login = normalizeLogin(account.login);
    if (!login) {
      uncertainties.push(`A participation record in ${account.source} carries no GitHub login, so no authenticated identity could be established.`);
      continue;
    }
    // Every GitHub App / bot account is permitted, whatever it is called. AI
    // coding agents that act through their own GitHub account land here.
    if (account.type === "Bot") {
      machineRecords += 1;
      continue;
    }
    if (webFlow && account.role === "committer" && login === normalizeLogin(webFlow.login)) {
      const status = webFlowCommitterStatus(account.commit, webFlow);
      if (status.ok) {
        machineRecords += 1;
      } else {
        uncertainties.push(`Committer "${account.login}" in ${account.source} could not be confirmed as GitHub's web-flow service account (${status.reason}).`);
      }
      continue;
    }
    if (account.type !== "User") {
      uncertainties.push(`Account "${account.login}" in ${account.source} has account type ${JSON.stringify(account.type ?? null)}, so its human/bot classification could not be established.`);
      continue;
    }
    if (authorizedHumans.has(login)) continue;
    if ((config.exceptions ?? []).some((exception) => validException(exception, login, now))) continue;

    const entry = unauthorized.get(login) ?? { login: account.login, id: account.id, sources: [] };
    if (!entry.sources.includes(account.source)) entry.sources.push(account.source);
    unauthorized.set(login, entry);
  }

  const findings = [...unauthorized.values()].map((participant) => {
    const shown = participant.sources.slice(0, MAX_REPORTED_SOURCES).join("; ");
    const hidden = participant.sources.length - MAX_REPORTED_SOURCES;
    const extra = hidden > 0 ? ` and ${hidden} further record${hidden === 1 ? "" : "s"}` : "";
    return `Unauthorized human participant "${participant.login}" (account ${participant.id ?? "unknown"}) is neither a configured maintainer nor an assignee of a linked issue: ${shown}${extra}.`;
  });

  return {
    status: findings.length ? "failure" : "pass",
    findings,
    uncertainties: [...new Set(uncertainties)],
    mode,
    linkedIssues,
    assignedContributors: [...assignedLogins].sort(),
    unauthorizedHumanCount: unauthorized.size,
    participantCount: accounts.length,
    machineRecords,
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
  for (const uncertainty of result.uncertainties ?? []) console.log(`? ${uncertainty}`);
  if (result.status !== "pass") {
    process.exitCode = 1;
    return;
  }
  const machine = `${result.machineRecords} bot or verified service record${result.machineRecords === 1 ? "" : "s"} permitted without individual approval`;
  if (result.mode === "maintainer") {
    console.log(`Reviewed ${result.participantCount} participation records for a maintainer-authored pull request without a linked issue (${machine}).`);
  } else {
    console.log(`Reviewed ${result.participantCount} participation records across linked issue(s): ${result.linkedIssues.map((n) => `#${n}`).join(", ")} (${machine}).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`PR Participant Guard: INCONCLUSIVE — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
