# Frozen POD print asset sets

## Integrity boundary

The first PDF render has two immutable inputs:

1. A frozen `pod_print_manifests/{manifest_id}` manifest.
2. A frozen `pod_print_asset_sets/{asset_set_id}` asset set created for that manifest and `pod-render-profile-v2`.

The asset-set identity is deterministic. Its canonical SHA-256 covers the manifest SHA-256, render-profile SHA-256 and version, renderer version, and every canonical item. Operational fields (`created_at`, `created_by`, `frozen_at`) do not affect this hash. Items bind the exact asset bytes and pinned Storage generation to their role, card/render-input association, MIME type, source metadata, and font or QR parameters.

The collections are:

- `pod_print_asset_sets/{asset_set_id}` - create-only header, first in `writing`, then compare-and-swap frozen.
- `pod_print_asset_set_items/{item_id}` - immutable canonical asset bindings.
- `pod_print_asset_set_chunks/{asset_set_id}-{chunk_index}` - immutable ordered item-ID chunks.

Firestore clients may read these documents only as active administrators and may never write them. Server writes use the Firestore REST precondition `currentDocument.exists=false`. Storage objects are content-addressed as `pod-print-assets/sha256/{prefix}/{sha256}.{extension}` and are created only with `ifGenerationMatch=0`.

## Frozen dependencies

Every render requires these roles:

- `postcard_front_photo` for each manifest position.
- `country_flag` for each manifest position, using `country_flag_url` or the existing `flagcdn.com` country-code derivation.
- `qr_raster` for each manifest position; the trusted backend generates it exactly once from the manifest's `qr_url` using the pinned QR profile.
- `postcard_front_template` and `postcard_back_template` from the repository PNG files.
- `print_font` for the exact Fontsource WOFF2 subsets selected from the manifest text, language codes and Unicode scripts.

Before acquiring assets, the backend verifies each manifest position's `render_input_sha256`. It rejects missing sources and never substitutes placeholders.

The profile in `src/lib/podRenderProfile.ts` pins library versions, template keys, the generated Fontsource registry version, the font-selection algorithm, QR options, raster sizes, JPEG quality, and all relevant `html2canvas` options. Its canonical profile SHA-256 includes the template hashes and every selected font-subset SHA-256. The browser reconstructs that binding from the frozen items. Any pixel-affecting change requires a new render-profile version. A profile version must never be edited in place after it has produced an artifact.

`src/lib/podFontRegistry.generated.ts` records versioned CDN URLs, Unicode ranges and exact SHA-256 values for Latin, Greek, Cyrillic, Arabic, Armenian, Hebrew, Khmer, Lao, Ethiopic, Thai, Georgian, Tifinagh, Japanese, Korean, Cantonese, Simplified Chinese and Traditional Chinese. The registry is regenerated only with `node scripts/generate-pod-font-registry.mjs`. Han text without an unambiguous language code, or one card combining incompatible CJK variants, fails closed before any asset is frozen.

Font provenance and license references are documented in `docs/pod-font-licenses.md`.

## Network threat model

Remote image and font acquisition happens only on the authenticated backend. The fetcher:

- Accepts HTTPS only and requires an exact hostname in a server-side allowlist.
- Resolves DNS and rejects loopback, private, link-local, multicast, unspecified, reserved, and cloud metadata destinations.
- Follows redirects manually and applies the complete URL, allowlist, and address validation to every hop.
- Enforces a request timeout, a redirect cap, and byte limits while streaming, without trusting `Content-Length` alone.
- Accepts only PNG, JPEG, WebP, and WOFF2 as appropriate and verifies magic bytes.
- Verifies configured template hashes and committed per-font SHA-256 values before any immutable record is written.

`flagcdn.com` is not contacted by the browser renderer. It is only an optional allowlisted acquisition source on the trusted backend.

## Storage preconditions and recovery

An upload returning HTTP `412` is never retried as an overwrite. The backend downloads the existing object generation and verifies exact bytes, SHA-256, size, MIME type, and custom metadata. Byte-identical matching content is idempotent success; any mismatch is `pod_asset_storage_conflict`.

Freezing is resumable after partial failure. Existing matching objects, items, chunks, or a `writing` header are verified and reused. A mismatch fails closed. Concurrent requests converge on the same deterministic asset-set ID and immutable object paths.

## Browser render isolation

`src/lib/podPrintAssetClient.ts` reconstructs the frozen set from authenticated API responses and independently verifies:

- Header state, manifest binding, profile version/hash, canonical asset-set SHA-256, chunks, item count, and item uniqueness.
- Every downloaded item's generation, MIME type, byte count, and SHA-256.
- All mandatory shared and per-card roles.

Images are exposed only as temporary `blob:` URLs. Fonts are installed from verified bytes using versioned `FontFace` family names. Rendering waits for all fonts and images, rejects non-Blob image URLs, and has no fallback to original URLs, Google Fonts, `flagcdn.com`, or system font family names. Blob URLs and font registrations are disposed in `finally`.

`html2canvas` receives explicit scale, dimensions, background, taint, CORS, logging, scroll, viewport, foreign-object, proxy, and timeout-related options from the profile. jsPDF retains fixed creation date, file ID and properties, and emits `output("arraybuffer")`.

## PDF artifact chain and reprints

New version-2 `pod_print_artifacts` documents and PDF Storage metadata include:

- `asset_set_id`
- `asset_set_sha256`
- `render_profile_version`

Artifact creation fails unless these fields match a complete frozen asset set and the frozen manifest. The archived PDF remains the source of truth for reprints.

Reprinting calls `GET /api/pod/print-artifact` and streams the exact archived PDF generation. It does not read or reacquire the asset set, fetch an external URL, rerun imposition, render React, invoke `html2canvas` or jsPDF, or regenerate QR bytes.

Legacy stage-4 artifacts that do not have asset-set fields remain reprintable from their pinned archived PDF generation. They cannot be treated as stage-5 rerender inputs and are never mutated or backfilled by this flow.

## Required configuration

Set these server-only variables before creating a new asset set:

```text
POD_PRINT_ASSET_ALLOWED_HOSTS=flagcdn.com,reviewed-photo-host.example
POD_PRINT_FONT_ALLOWED_HOSTS=cdn.jsdelivr.net
POD_PRINT_TEMPLATE_FRONT_SHA256=<64 lowercase hex characters>
POD_PRINT_TEMPLATE_BACK_SHA256=<64 lowercase hex characters>
```

Image and font origins have separate exact-host allowlists. The runtime never uses mutable Google Fonts CSS endpoints. Font URLs include the exact Fontsource package version and their bytes must match the committed registry hash.

The generator calculates font SHA-256 values from exact WOFF2 bytes and writes them into the reviewed source registry. Runtime acquisition never infers or accepts a new hash. Changing Fontsource version, Unicode ranges, a font URL or bytes requires registry regeneration, review and a new render-profile version.

## Operations

- `POST /api/pod/print-assets` with `operation: "freeze"` creates or resumes one frozen set; active administrator authorization is required.
- `get_chunk` and `get_item` return canonical metadata required for browser reconstruction.
- `download` streams only the item's recorded Storage object generation after server-side metadata and byte verification.
- No migration or mutation of existing Firestore or Cloud Storage data is required.

Canonical first-render output is not promised across browser engines: canvas text and image rasterization may differ. Canonical reprint output is guaranteed by returning the exact archived PDF bytes.
