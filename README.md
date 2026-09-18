# Split-Flap Display

A Tauri + vanilla TypeScript desktop split-flap departure board, with theming,
a local+API quote rotation, display-mode switching (windowed/widget/fullscreen),
and Google Calendar integration (urgent-event preemption on the board).

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Building on Windows with the GNU toolchain

If `rustup show` reports `stable-x86_64-pc-windows-gnu` as the active toolchain
(no Visual Studio Build Tools installed), `cargo build`/`check`/`test` need a
MinGW-w64 install on `PATH` — the toolchain alone doesn't ship `dlltool`/`as`.
Install MSYS2 and its `mingw-w64-x86_64-toolchain` package, then run cargo with:

```
export PATH="$PATH:/c/msys64/mingw64/bin:$HOME/.rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/gcc-ld"
```

(the `gcc-ld` entry supplies `ld.lld`, which is what `rustc` asks the mingw
`gcc` driver to link with by default). Known issue on this setup: `cargo test`
compiles and links fine but the produced **`--lib` unit test harness binary**
currently crashes on launch with `STATUS_ENTRYPOINT_NOT_FOUND` — a DLL-loading
problem specific to that test-harness binary in this MSYS2/mingw environment,
reproducible on a from-scratch clean build and independent of linker choice
(`lld` vs `ld.bfd`). Confirmed **not** a general problem: `cargo build`'s
actual `splitflap-desktop.exe` app binary launches and runs fine. Until the
test harness issue is root-caused, `cargo check --tests` (fully type-checks
test code, just can't execute it) is the fastest Rust correctness signal.

## Running it locally

Use `npm run tauri dev` (after setting the `PATH` above), not a bare
`cargo build` + running the exe yourself: a debug build's webview is pointed
at the Vite dev server (`http://localhost:1420`), not the bundled frontend,
so running it standalone without that dev server gives a
"localhost refused to connect" error. `npm run tauri dev` starts both
together.

## Packaging a release build / installer

`npm run tauri build` produces an installer (NSIS `.exe` and MSI, per this
project's `bundle.targets: "all"`) under
`src-tauri/target/release/bundle/` — that's what you hand to someone else to
install the app; no dev server or Rust toolchain needed on their end.

On a memory-constrained machine (this one has 7.4GB RAM), a release build
can fail with `STATUS_STACK_BUFFER_OVERRUN` / "the paging file is too small
for this operation to complete" under cargo's default parallelism — several
LTO-enabled linking processes (one per CPU core) running at once spikes past
the system's commit-charge limit. It is **not** actually about page file
*size* (a 22GB page file still hit this). Fix: serialize the build with
`CARGO_BUILD_JOBS=1` (or `cargo build --release --jobs 1` directly) — slower
(~17 minutes on this machine vs. failing immediately at default
parallelism), but keeps the release profile's LTO + single-codegen-unit
fully intact:

```
export CARGO_BUILD_JOBS=1
npm run tauri build
```

The resulting installer is **unsigned** (no code-signing certificate
configured) — anyone installing it will see a Windows SmartScreen
"unrecognized publisher" warning and need to click through it. Expected
without a paid cert, not a bug.

## Google Calendar setup

The board can preempt itself with upcoming/urgent calendar events. This needs
your own OAuth client, since Google doesn't allow a shared one across
installs:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project.
2. Under **APIs & Services > Library**, find **Google Calendar API** and
   click **Enable**. This is separate from creating the OAuth client below —
   skipping it doesn't break sign-in (the OAuth flow completes fine), it just
   makes every event fetch fail with a 403 `SERVICE_DISABLED` error and the
   board silently shows no events, which is a confusing thing to debug after
   the fact.
3. Under **APIs & Services > OAuth consent screen**, set one up (Desktop,
   "External" is fine while unpublished, with yourself in the test-users
   list).
4. Under **APIs & Services > Credentials**, create an OAuth client of type
   **Desktop app**. Copy its Client ID and Client Secret.
5. In the app's Settings > Google Calendar panel, paste those two values and
   save, then click **Connect Google Calendar** — this opens your browser for
   consent and completes automatically via a local loopback redirect.

Tokens are stored in the OS keychain; the client id/secret pair lives in a
plain config file in the app's data directory (Google does not treat it as
confidential for installed-app clients).
