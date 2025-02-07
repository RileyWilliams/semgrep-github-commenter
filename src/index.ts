import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFileSync } from "fs";

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    lines: string;
  };
}

interface SemgrepResults {
  errors?: SemgrepFinding[];
  results?: SemgrepFinding[];
}

function createMarkdown(
  findings: SemgrepFinding[],
  owner: string,
  repo: string,
  ref: string
): string {
  let markdown = "# Semgrep Scan Results\n\n";

  if (findings.length === 0) {
    markdown += "✅ No issues found!\n";
    return markdown;
  }

  markdown += `Found ${findings.length} issue(s):\n\n`;

  for (const finding of findings) {
    const severity = finding.extra.severity.toUpperCase();
    markdown += `### ${severity}: ${finding.check_id}\n`;
    markdown += `[**File:** \`${finding.path}\`](https://github.com/${owner}/${repo}/blob/${ref}/${finding.path}#L${finding.start.line})\n`;
    markdown += `**Location:** Line ${finding.start.line}, Column ${finding.start.col}\n\n`;
    markdown += `${finding.extra.message}\n\n`;
    markdown += "```\n";
    markdown += finding.extra.lines;
    markdown += "\n```\n\n";
  }

  return markdown;
}

function severityPriority(sev: string): number {
  switch (sev.toUpperCase()) {
    case "CRITICAL":
      return 5;
    case "HIGH":
      return 4;
    case "MEDIUM":
      return 3;
    case "LOW":
      return 2;
    case "INFO":
    default:
      return 1;
  }
}

function filterFindingsBySeverity(
  findings: SemgrepFinding[],
  threshold: string
): SemgrepFinding[] {
  return findings.filter(
    (f) => severityPriority(f.extra.severity) >= severityPriority(threshold)
  );
}

async function run(): Promise<void> {
  try {
    const reportPath = core.getInput("report-path");
    const githubToken = core.getInput("github-token");
    const severityThreshold = core.getInput("severity-threshold") || "INFO";

    // Added checks for missing inputs
    if (!reportPath) {
      core.setFailed("Missing required input: 'report-path'");
      return;
    }
    if (!githubToken) {
      core.setFailed("Missing required input: 'github-token'");
      return;
    }

    // Create an authenticated client
    const octokit = github.getOctokit(githubToken);

    // Read and parse the Semgrep JSON report
    const reportContent = readFileSync(reportPath, "utf8");
    const parsed: SemgrepResults = JSON.parse(reportContent);

    // Semgrep sometimes uses `results` or `errors`. We'll pull whichever is populated.
    const findings = parsed.results || parsed.errors || [];

    // Filter out findings below our threshold
    const filteredFindings = filterFindingsBySeverity(
      findings,
      severityThreshold
    );

    const context = github.context;
    const { owner, repo } = context.repo;
    // Use PR head or a default/fallback
    const ref = context.payload.pull_request?.head?.ref ?? "main"; // TODO: Make this configurable

    // Generate the markdown only for filtered findings
    const markdown = createMarkdown(filteredFindings, owner, repo, ref);

    // Post comment on PR if available
    if (context.payload.pull_request) {
      const prNumber = context.payload.pull_request.number;

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: markdown,
      });
    } else {
      core.warning(
        "No pull request context - this action only comments if triggered on a PR."
      );
    }

    // Optionally fail the action if we found any issues at or above the threshold
    if (filteredFindings.length > 0) {
      core.setFailed(
        `Found ${filteredFindings.length} ${severityThreshold}+ severity issue(s).`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred.");
    }
  }
}

run();
