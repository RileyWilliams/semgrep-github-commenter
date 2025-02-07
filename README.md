# Semgrep Github PR commenter Action

This action will comment on a Github PR with the results of a Semgrep scan.

## Usage

```yaml
 name: Semgrep Scan

   on: [pull_request]

   jobs:
     semgrep:
       runs-on: ubuntu-latest
       container:
         image: semgrep/semgrep

       steps:
         - name: Checkout code
           uses: actions/checkout@v4

         - name: Run Semgrep scan
           run: semgrep scan --config auto --json > report.json

         - name: Report issues via semgrep2github-action
           uses: rileywilliams/semgrep-github-commenter-action@v1.0.0 # Local path to the new action
           with:
             report-path: report.json
             github-token: ${{ secrets.GITHUB_TOKEN }}
```
