# Maintained fork

This fork adds ChatGPT BasisPoints, Zcode accounts and plan claiming, and expanded English localization to [james-6-23/codex2api](https://github.com/james-6-23/codex2api). Original history and notices are retained. Zcode's copied system fixture has a separate [educational-use notice](../third_party/Zcode2Api.LICENSE).

The **Sync upstream releases** GitHub Actions workflow checks the latest upstream public release every six hours. It merges that release into the fork, runs frontend tests, TypeScript checks, the frontend build, and backend tests, then pushes the tested merge. Each successful update gets a tag such as `v3.1.6-fork.12` and dispatches the binary-release and Docker-image workflows. It uses the repository's built-in `GITHUB_TOKEN`; no personal token is stored in the repository.

If a merge conflicts or validation fails, the workflow fails before pushing. Fork changes are preserved. Resolve conflicts locally, run the checks, and push the result. GitHub's normal Actions notifications report failures. Schedules can be delayed by GitHub and inactive public repositories may have scheduled workflows disabled after 60 days. You can run the workflow manually in Actions; enable **publish_current** to build a fork release when upstream is already merged.

Release automation updates the public repository and produces release artifacts; it does not update an existing local checkout or restart deployed containers. To update this checkout, run `git pull --ff-only origin main`, then rebuild your local deployment. For prebuilt containers use the fork's `ghcr.io/reb0rnender/codex2api` image instead of upstream's image.

The built-in binary updater and deployment defaults use this fork. Fork revision numbers are compared numerically, so another build of the same upstream version is offered as an update too. Successful automated Docker builds update the fork's `latest` tag.

Private HAR captures, inspection downloads, local account fixtures, `.env` files, runtime databases, and dependency/build directories are excluded from the public commit. The Docker build also excludes authentication captures.
