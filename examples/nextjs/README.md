# HPB Markup · Next.js (App Router) example

- `app/page.tsx`: **server component**. Renders the examples A–E to SVG on the server with
  `renderHpbToString` from `@hpb/react/server` (no client JavaScript for the diagrams).
- `app/interactive/page.tsx`: **client component**. `<HpbDiagram>` from `@hpb/react` with hover
  dimming and `onNodeClick`.

`next.config.mjs` adds a webpack rule (and a Turbopack rule with `raw-loader`) so `*.hpb` files can be
imported as strings; `hpb.d.ts` declares the module type for TypeScript. Reading the file with
`fs.readFileSync(path.join(process.cwd(), "roadmap.hpb"), "utf8")` in a server component works with
any bundler and needs neither.

```bash
pnpm install
pnpm --filter @hpb/core --filter @hpb/react build
NEXT_TELEMETRY_DISABLED=1 pnpm --filter @hpb/example-nextjs build
pnpm --filter @hpb/example-nextjs start
```

MIT © 2026 Achraf Bouchtarouif El Khiat
