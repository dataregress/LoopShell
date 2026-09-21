# Generated bindings

`bindings.ts` in this folder is written by `tauri-specta` from the commands and
events registered in `src-tauri/src/ipc/`:

```
cd src-tauri
cargo run --bin export-bindings
```

It is committed and never hand-edited. CI runs the export and fails on
`git diff --exit-code contracts/bindings`.

`src/adapters/tauri.ts` is the only consumer. It calls the generated `commands`
and listens through the generated `events`, so a renamed command or changed
argument shape fails `tsc`; results are still validated with the Zod schemas in
`contracts/schemas`, which remain the source of truth for payload bodies
(cards, Attention items, Ledger rows are exported as `unknown` on purpose).
