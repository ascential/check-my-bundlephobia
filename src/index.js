const fetch = require("node-fetch");
const { exec } = require("child_process");
const { Octokit } = require("@octokit/rest");
const core = require("@actions/core");
const utils = require("./utils");

const octokit = new Octokit({
  auth: process.env.TOKEN || core.getInput("repo-token")
});

exec(
  `git diff refs/remotes/origin/${process.env.GITHUB_BASE_REF} refs/remotes/origin/${process.env.GITHUB_HEAD_REF} package.json`,
  (err, out, e) => {
    const packageList = utils.getPackageListFromDiff(out);
    const sizes = [];
    const requests = packageList.map(package =>
      fetch(`https://bundlephobia.com/api/size?package=${package}`, {
        headers: {
          "User-Agent": "bundle-phobia-cli",
          "X-Bundlephobia-User": "bundle-phobia-cli"
        }
      }).then(r => {
        console.log("package response", package);
        return r.json().then(l => {
          console.log("package json", l);
          if (!l.error) {
            sizes.push({ name: l.name, gzip: l.gzip, size: l.size, package });
          }
        });
      })
    );
    if (
      process.env.GITHUB_REF.split("refs/pull/") &&
      process.env.GITHUB_REPOSITORY.split("/")
    ) {
      Promise.all(requests).then(() => {
        if (sizes.length) {
          console.log(
            core.getInput("threshold"),
            core.getInput("strict"),
            sizes.find(e => e.gzip > core.getInput("threshold")) &&
              core.getInput("strict")
              ? "REQUEST_CHANGES"
              : "COMMENT"
          );
          const [owner, repositoryName] = process.env.GITHUB_REPOSITORY.split(
            "/"
          );
          octokit.pulls.createReview({
            owner,
            repo: repositoryName,
            pull_number: process.env.GITHUB_REF.split("refs/pull/")[1].split(
              "/"
            )[0],
            body: utils.getMarkDownTable(sizes),
            event:
              sizes.find(e => e.gzip > core.getInput("threshold")) &&
              core.getInput("strict")
                ? "REQUEST_CHANGES"
                : "COMMENT"
          });
        }
      });
    } else {
      const [owner, repositoryName] = process.env.GITHUB_REPOSITORY.split("/");
      octokit.pulls.createReview({
        owner,
        repo: repositoryName,
        pull_number: process.env.GITHUB_REF.split("refs/pull/")[1].split(
          "/"
        )[0],
        body: `
          out: ${JSON.stringify(out)}
          err: ${JSON.stringify(err)}
          e: ${JSON.stringify(e)}
          packageList: ${JSON.stringify(packageList)}
          GITHUB_BASE_REF: ${process.env.GITHUB_BASE_REF}
          GITHUB_HEAD_REF: ${process.env.GITHUB_HEAD_REF}
          GITHUB_REPOSITORY: ${process.env.GITHUB_REPOSITORY}
          GITHUB_REF: ${process.env.GITHUB_REF}
          requests: ${JSON.stringify(requests)}
          sizes: ${JSON.stringify(sizes)}
        `,
        event: "COMMENT"
      });
    }
  }
);
