import chalk from "chalk";
import type { Command } from "commander";
import { program } from "commander";
import * as jsonc from "jsonc-parser";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { format } from "prettier";
import type { StarbeamCommandOptions } from "./commands.js";
import { queryable } from "./list.js";
import type { Package } from "./support/packages.js";

export function TemplateCommand({ root }: StarbeamCommandOptions): Command {
  return queryable(
    root,
    program
      .createCommand("template")
      .description("template a package")
      .addHelpText(
        "afterAll",
        chalk.yellow(
          "\nPackages are only included if they include a `main` field in their package.json"
        )
      ),
    (packages) => {
      for (const pkg of packages) {
        console.log(chalk.magenta(`=== Updating ${pkg.name} ===`));
        updatePackageJSON(root, pkg);

        if (pkg.isTypescript) {
          updateTsconfig(root, pkg);
        }
      }
    }
  );
}

function updatePackageJSON(root: string, pkg: Package) {
  console.log(chalk.gray(`+ package.json`));

  const splice = JSON.parse(
    readFileSync(resolve(root, ".templates", "package", "package.json"), "utf8")
  );

  const editingJSON = resolve(pkg.root, "package.json");

  const json = JSON.parse(readFileSync(editingJSON, "utf-8"));

  Object.assign(json, splice);

  if (json.main) {
    json.exports = {
      default: `./${json.main}`,
    };
  }

  writeFileSync(editingJSON, JSON.stringify(json, null, 2));
}

function updateTsconfig(root: string, pkg: Package) {
  const parent = resolve(pkg.root, "..");
  const relativeParent = relative(root, parent);

  console.log(chalk.gray(`+ tsconfig.json`));

  const tsconfigFile = resolve(pkg.root, "tsconfig.json");

  const editor = EditJsonc.parse(tsconfigFile);

  editor.addUnique(
    "compilerOptions.types",
    join(relative(pkg.root, resolve(root, "packages", "./env"))),
    (type) => typeof type === "string" && type.endsWith("/env")
  );

  if (pkg.tsconfig) {
    editor.set(
      "extends",
      join(
        relative(pkg.root, resolve(root, ".config", "tsconfig", pkg.tsconfig))
      ),
      { position: 0 }
    );
  } else if (isInside("packages") || isInside("framework/react")) {
    editor.set(
      "extends",
      join(
        relative(
          pkg.root,
          resolve(root, ".config", "tsconfig", "tsconfig.-package.json")
        )
      ),
      { position: 0 }
    );
  } else if (isInside("demos")) {
    editor.set(
      "extends",
      join(
        relative(
          pkg.root,
          resolve(root, ".config", "tsconfig", "tsconfig.-demo.json")
        )
      ),
      { position: 0 }
    );
  } else {
    console.error(
      chalk.red(
        `${pkg.root} is inside of unknown parent directory: ${relativeParent}`
      )
    );
    process.exit(1);
  }

  editor.set("compilerOptions.composite", true);
  editor.set("compilerOptions.declaration", true);
  editor.set("compilerOptions.emitDeclarationOnly", true);
  editor.set(
    "compilerOptions.declarationDir",
    relative(pkg.root, resolve(root, "dist", "types", ...pkg.name.split("/")))
  );
  editor.set("compilerOptions.declarationMap", true);

  editor.write();

  function isInside(directory: string) {
    const absoluteDirectory = resolve(root, directory);
    const relativePath = relative(absoluteDirectory, pkg.root);
    return (
      relativePath &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath)
    );
  }
}

class EditJsonc {
  static parse(filename: string) {
    try {
      const source = readFileSync(filename, "utf8");
      return new EditJsonc(filename, source, jsonc.parse(source));
    } catch {
      return new EditJsonc(filename, "{}", jsonc.parseTree("{}")!);
    }
  }

  #filename: string;
  #source: string;
  #json: jsonc.Node;

  constructor(filename: string, source: string, json: jsonc.Node) {
    this.#filename = filename;
    this.#source = source;
    this.#json = json;
  }

  remove(path: string) {
    const jsonPath = this.#path(path);
    const edit = jsonc.modify(this.#source, jsonPath, undefined, {});
    this.#source = jsonc.applyEdits(this.#source, edit);
    this.#json = jsonc.parseTree(this.#source)!;
  }

  addUnique(path: string, value: unknown, check: (json: unknown) => boolean) {
    if (check(this.#json)) {
      return;
    }

    jsonc.findNodeAtLocation;

    const jsonPath = this.#path(path);
    const node = jsonc.findNodeAtLocation(this.#json, jsonPath);

    if (node && node.type === "array") {
      const value = node.value as unknown[];
      const index = value.findIndex((v) => check(v));

      const edit = jsonc.modify(this.#source, [...jsonPath, index], value, {});
      this.#source = jsonc.applyEdits(this.#source, edit);
      this.#json = jsonc.parseTree(this.#source)!;
    } else {
      const edit = jsonc.modify(this.#source, jsonPath, [value], {});
      this.#source = jsonc.applyEdits(this.#source, edit);
      this.#json = jsonc.parseTree(this.#source)!;
    }
  }

  set(
    path: string,
    value: unknown,
    {
      position = -1,
    }: { position?: number | ((siblings: string[]) => number) } = {}
  ) {
    const edit = jsonc.modify(this.#source, this.#path(path), value, {
      getInsertionIndex:
        typeof position === "function" ? position : () => position,
    });

    this.#source = jsonc.applyEdits(this.#source, edit);
    this.#json = jsonc.parseTree(this.#source)!;
  }

  write() {
    const formatted = format(this.#source, { parser: "json" });
    writeFileSync(this.#filename, formatted);
  }

  #path(source: string) {
    return source.split(".").map((p) => {
      if (/^\d+$/.test(p)) {
        return Number(p);
      } else {
        return p;
      }
    });
  }
}

function typeIndex(tsconfig: unknown): number {
  if (typeof tsconfig !== "object" || tsconfig === null) {
    return -1;
  }

  const types = (tsconfig as Record<string, any>)?.compilerOptions?.types;

  if (Array.isArray(types)) {
    return types.findIndex((t) => t.endsWith("/env"));
  } else {
    return -1;
  }
}
