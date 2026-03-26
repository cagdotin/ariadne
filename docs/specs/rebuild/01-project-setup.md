# Ariadne — Rebuild Spec 01: Project Setup

> Complete scaffolding, dependencies, and configuration to go from empty directory to building.

## Directory Structure

```
ariadne/
├── index.html                  # HTML entry point
├── package.json                # Frontend dependencies + scripts
├── tsconfig.json               # TypeScript config
├── tsconfig.node.json          # TypeScript config for Vite/node
├── vite.config.ts              # Vite config with Tauri + Tailwind
├── components.json             # shadcn/ui config (if using CLI)
├── AGENTS.md                   # Agent coding guide
├── src/                        # Frontend source (React + TypeScript)
├── src-tauri/                  # Rust backend (Tauri v2)
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/                  # App icons (all platforms)
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── cache.rs
│       ├── sidecar.rs
│       ├── models/
│       │   ├── mod.rs
│       │   ├── session.rs
│       │   ├── analytics.rs
│       │   └── qmd.rs
│       ├── parser/
│       │   ├── mod.rs
│       │   ├── discovery.rs
│       │   └── session.rs
│       └── commands/
│           ├── mod.rs
│           ├── analytics.rs
│           └── qmd.rs
├── src-sidecar/                # QMD bridge sidecar (TypeScript/Bun)
│   ├── qmd-bridge.ts
│   ├── package.json
│   └── tsconfig.json
├── dist/                       # Vite build output (gitignored)
└── docs/                       # Documentation
```

## Step 1: Initialize the Tauri v2 project

```bash
# Create using Tauri CLI
bunx create-tauri-app ariadne --template react-ts --manager bun

# Or manually scaffold — either way, the end result must match below
```

## Step 2: Frontend package.json

```json
{
  "name": "ariadne",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@base-ui/react": "^1.3.0",
    "@fontsource-variable/geist": "^5.2.8",
    "@tailwindcss/vite": "^4.2.2",
    "@tanstack/react-router": "^1.168.0",
    "@tanstack/react-table": "^8.21.3",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2.6.0",
    "@tauri-apps/plugin-opener": "^2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.577.0",
    "motion": "^12.38.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-markdown": "^10.1.0",
    "react-syntax-highlighter": "^16.1.1",
    "recharts": "2.15.4",
    "rehype-raw": "^7.0.0",
    "remark-gfm": "^4.0.1",
    "shadcn": "^4.0.8",
    "tailwind-merge": "^3.5.0",
    "tailwindcss": "^4.2.2",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/node": "^25.5.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@types/react-syntax-highlighter": "^15.5.13",
    "@vitejs/plugin-react": "^4.6.0",
    "typescript": "~5.8.3",
    "vite": "^7.0.4"
  }
}
```

## Step 3: Vite config (`vite.config.ts`)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

## Step 4: TypeScript configs

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

## Step 5: HTML entry point (`index.html`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ariadne</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## Step 6: Tauri backend (`src-tauri/`)

### `Cargo.toml`

```toml
[package]
name = "ariadne"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
edition = "2021"

[lib]
name = "ariadne_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "6"
walkdir = "2"
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1", features = ["sync"] }
rusqlite = { version = "0.34", features = ["bundled"] }
tauri-plugin-dialog = "2.6.0"
regex = "1"
```

### `build.rs`

```rust
fn main() {
    tauri_build::build()
}
```

### `tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ariadne",
  "version": "0.1.0",
  "identifier": "com.cgn.ariadne",
  "build": {
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "ariadne",
        "width": 1200,
        "height": 800
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

### `capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
}
```

## Step 7: QMD Sidecar (`src-sidecar/`)

### `package.json`

```json
{
  "name": "ariadne-qmd-bridge",
  "private": true,
  "type": "module",
  "dependencies": {
    "@tobilu/qmd": "^2.0.1",
    "fast-glob": "^3.3.0"
  }
}
```

## Step 8: Install & verify

```bash
# Frontend dependencies
bun install

# Sidecar dependencies
cd src-sidecar && bun install && cd ..

# Verify Tauri builds
bun run tauri dev
```

## Step 9: Initialize shadcn/ui

Use the shadcn CLI to add base components:

```bash
bunx shadcn@latest init
```

Then add needed components:

```bash
bunx shadcn@latest add button card table sidebar sheet dropdown-menu popover badge breadcrumb input separator skeleton tooltip
```

These go into `src/components/ui/`.
