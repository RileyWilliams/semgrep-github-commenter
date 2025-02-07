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

async function run(): Promise<void> {
  try {
    const reportPath = core.getInput("report-path");
    const githubToken = core.getInput("github-token");

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

    const context = github.context;
    const { owner, repo } = context.repo;
    // Use PR head or a default/fallback
    const ref = context.payload.pull_request?.head?.ref ?? "main"; // TODO: Make this configurable

    const markdown = createMarkdown(findings, owner, repo, ref);

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
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred.");
    }
  }
}

run();
