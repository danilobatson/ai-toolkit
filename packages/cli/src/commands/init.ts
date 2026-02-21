import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfig } from "../lib/templates.js";
import {
  gitignore,
  envExample,
  dockerCompose,
  readme,
  projectClaudeMd,
  backendPyproject,
  backendPythonVersion,
  backendAppInit,
  backendConfig,
  backendMain,
  backendHealthRoute,
  backendRoutesInit,
  frontendPackageJson,
  frontendTsconfig,
  frontendNextConfig,
  frontendLayout,
  frontendPage,
  frontendApiClient,
} from "../lib/templates.js";

interface FileEntry {
  path: string;
  content: string;
}

function generateFiles(config: ProjectConfig): FileEntry[] {
  const files: FileEntry[] = [
    // Root
    { path: ".gitignore", content: gitignore() },
    { path: ".env.example", content: envExample(config) },
    { path: "docker-compose.yml", content: dockerCompose(config) },
    { path: "README.md", content: readme(config) },
    { path: "CLAUDE.md", content: projectClaudeMd(config) },

    // Backend
    { path: "backend/pyproject.toml", content: backendPyproject(config) },
    { path: "backend/.python-version", content: backendPythonVersion() },
    { path: "backend/app/__init__.py", content: backendAppInit() },
    { path: "backend/app/config.py", content: backendConfig(config) },
    { path: "backend/app/main.py", content: backendMain(config) },
    { path: "backend/app/routes/__init__.py", content: backendRoutesInit() },
    { path: "backend/app/routes/health.py", content: backendHealthRoute() },
    { path: "backend/tests/__init__.py", content: "" },

    // Frontend
    { path: "frontend/package.json", content: frontendPackageJson(config) },
    { path: "frontend/tsconfig.json", content: frontendTsconfig() },
    { path: "frontend/next.config.mjs", content: frontendNextConfig() },
    {
      path: "frontend/src/app/layout.tsx",
      content: frontendLayout(config),
    },
    { path: "frontend/src/app/page.tsx", content: frontendPage(config) },
    {
      path: "frontend/src/lib/api.ts",
      content: frontendApiClient(),
    },
  ];

  return files;
}

export const initCommand = new Command("init")
  .description("Scaffold a new full-stack AI project")
  .argument("<name>", "Project name (used as directory name)")
  .option(
    "--backend <type>",
    "Backend framework (fastapi)",
    "fastapi",
  )
  .option(
    "--frontend <type>",
    "Frontend framework (nextjs)",
    "nextjs",
  )
  .action((name: string, options: { backend: string; frontend: string }) => {
    const targetDir = join(process.cwd(), name);

    // Guard: don't overwrite existing directory
    if (existsSync(targetDir)) {
      console.error(
        chalk.red(`\n  Error: Directory "${name}" already exists.\n`),
      );
      process.exitCode = 1;
      return;
    }

    const config: ProjectConfig = {
      name,
      backend: options.backend as ProjectConfig["backend"],
      frontend: options.frontend as ProjectConfig["frontend"],
    };

    console.log();
    console.log(chalk.bold(`  aitk init ${name}`));
    console.log(chalk.dim("  Scaffolding project...\n"));

    const files = generateFiles(config);

    // Create all directories and write files
    let fileCount = 0;
    for (const file of files) {
      const fullPath = join(targetDir, file.path);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
      fileCount++;

      console.log(`  ${chalk.green("✓")} ${file.path}`);
    }

    // Summary and next steps
    console.log();
    console.log(chalk.green(`  Created ${fileCount} files in ${name}/\n`));
    console.log(chalk.bold("  Next steps:\n"));
    console.log(chalk.cyan(`  cd ${name}`));
    console.log(chalk.cyan("  cp .env.example .env          # add your API keys"));
    console.log(chalk.cyan("  docker compose up -d           # start Postgres + Redis"));
    console.log(chalk.cyan("  cd backend && uv sync          # install Python deps"));
    console.log(
      chalk.cyan(
        "  uv run uvicorn app.main:app --reload  # start backend",
      ),
    );
    console.log(chalk.cyan("  cd ../frontend && yarn install  # install frontend deps"));
    console.log(chalk.cyan("  yarn dev                        # start frontend"));
    console.log();
  });
