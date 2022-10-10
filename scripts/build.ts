import { QueryCommand } from "./support/commands.js";
import { CheckDefinition } from "./support/workspace.js";

export const BuildCommand = QueryCommand("build", {
  description: "prepare the packages for publishing",
})
  .flag(
    ["-O", "streamOutput"],
    "do not stream the lint output (but display it when the command fails)",
    { default: true }
  )
  .action(async ({ workspace, packages, streamOutput }) => {
    const results = await workspace.check(
      ...packages.map((pkg) =>
        CheckDefinition(pkg.name, "rollup -c ./rollup.config.mjs", {
          cwd: pkg.root,
          output: streamOutput ? "stream" : "when-error",
        })
      )
    );

    workspace.reporter.reportCheckResults(results, {
      success: "build succeeded",
    });

    return results.exitCode;
  });
