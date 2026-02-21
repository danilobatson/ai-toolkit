# @jamaalbuilds/aitk

CLI for scaffolding AI-powered full-stack applications.

Part of [@jamaalbuilds/ai-toolkit](https://github.com/danilobatson/ai-toolkit).

## Install

```bash
yarn global add @jamaalbuilds/aitk
# or
npx @jamaalbuilds/aitk
```

## Commands

### `aitk doctor`

Validates your development environment:
- Node.js >=18, yarn, Python >=3.12, uv, Docker, Git
- Checks for API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

### `aitk init <project-name>`

Scaffolds a new AI project with:
- FastAPI backend with ai-toolkit SDK pre-wired
- Next.js frontend
- Docker Compose (Postgres + Redis)
- Environment files with sensible defaults
- CLAUDE.md for Claude Code context

```bash
aitk init my-ai-app
cd my-ai-app
docker compose up -d
```

## License

MIT
