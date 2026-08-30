# Self-hosted fonts

Three variable fonts, served from this directory rather than fetched from
Google Fonts at build and boot time.

| Family | Files | Licence |
| ------ | ----- | ------- |
| Space Grotesk | `space-grotesk-latin*-wght-normal.woff2` | SIL Open Font License 1.1 |
| Inter | `inter-latin*-wght-normal.woff2` | SIL Open Font License 1.1 |
| JetBrains Mono | `jetbrains-mono-latin*-wght-normal.woff2` | SIL Open Font License 1.1 |

All three are licensed under the SIL OFL 1.1, which permits redistribution and
embedding provided the licence notice accompanies the files — the
`LICENSE-*.txt` files here serve that purpose and must not be removed.

Obtained from the corresponding `@fontsource-variable/*` npm packages. These are
the same upstream typefaces previously loaded over the network; the rendering is
unchanged.

## Why self-hosted

`next/font/google` performs an external fetch during build and on first render.
Browser QA found that when `fonts.googleapis.com` was unreachable the fetch threw
and **took down every page that renders the root layout** — a third-party CDN had
become a hard boot dependency. Serving the files locally removes that failure
mode, and removes a third-party request from every visit.

Each file is a variable font covering the full weight axis, so the same set of
weights remains available.
