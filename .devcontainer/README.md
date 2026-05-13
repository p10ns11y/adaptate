# Dev container

Optional development environment: **Node 24** (Bookworm) and **[pnpm@11.1.1](mailto:pnpm@11.1.1)** via Corepack, matching root `package.json` `engines` and `packageManager`. The workspace folder is bind-mounted; your host home is not mounted by default.

## Prerequisites

- **Docker** or **Podman** running locally
- Dev Containers integration:
  - **VS Code:** extension **Dev Containers** by Microsoft — ID `ms-vscode-remote.remote-containers`
  - **Cursor:** use **Dev Containers** by **Anysphere** — ID `**anysphere.remote-containers`**. In Cursor, open **Extensions** and search `Dev Containers` (not the Microsoft-only Remote pack from the Open VSX/VS Code flow you may be used to). Install/enable that extension; then **Command Palette** shows **Dev Containers:** commands such as **Reopen Folder Locally**.

## Open in container

1. Open this repository folder in the editor.
2. Command Palette → **Dev Containers: Reopen Folder Locally** (first run pulls the image).
3. Wait for **postCreateCommand** to finish (`pnpm install --frozen-lockfile --ignore-scripts`).
4. Use the integrated terminal and run `**pnpm`** commands only (`pnpm lint`, `pnpm test`, `pnpm build`).

After changing `**devcontainer.json**`, run **Dev Containers: Rebuild Container**.

See root `[AGENTS.md](../AGENTS.md)` for full project guidelines.