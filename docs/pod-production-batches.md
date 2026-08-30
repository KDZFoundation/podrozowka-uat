# Deterministic POD production batches

## Scope

Stage 6 joins positions from multiple frozen POD manifests into versioned production batches. It does not discover candidates: the authenticated server endpoint receives an explicit list of `{ print_manifest_id, asset_set_id }` pairs, reads and verifies those exact frozen documents, and passes explicit source positions to the pure planner.

No AI, random value, current time, Firestore response order, parallel completion order, or asset download order affects grouping or placement.

## Stable order and ganging

The stable source key is:

1. `print_format_id`
2. `batch_order_index`
3. `source_order_id`
4. `print_job_id`
5. `sequence_index`
6. `inventory_unit_id`
7. `print_job_item_id`

Positions gang only when the canonical compatibility payload is identical. It contains the complete print-format configuration, SRA3 dimensions, imposition algorithm version, render-profile version and SHA-256, duplex mode, and cut-stack profile. Different `asset_set_id` values are allowed after each frozen set and its per-position coverage have passed integrity verification. Different format IDs or incompatible profiles create separate imposition groups and never share a sheet.

## Cut and stack

Profile `cut-stack-short-edge-sra3-v1` explicitly fixes:

- SRA3 portrait sheet `320 x 450 mm`.
- Duplex `flip_on_short_edge`.
- Printer output order `sheet_index_ascending`, face up.
- Physical sheet stack top-to-bottom `ascending_sheet_index_top_to_bottom`.
- Slot traversal `row_major_top_left_to_bottom_right`.
- Pile merge `ascending_front_slot`.

Columns, rows, slot count, front coordinates, back slot, and back coordinates are read from `planPodImposition()`. The batch planner does not implement a duplex reflection formula.

For `K` cards, `S` slots, and `T = ceil(K / S)` sheets, front slot `s` on sheet `t` receives:

```text
source_sequence_index = s * T + t
```

An index at or above `K` creates an explicit empty slot. After printing sheets in ascending index, stacking them in that same top-to-bottom order, cutting piles by row-major slot, and merging piles by ascending slot, the cards are `0, 1, ..., K-1`.

Example for the current 8-slot postcard format:

- Full batch, `K=8`, `T=1`: sheet 0 slots contain `0,1,2,3,4,5,6,7`; there are no blanks.
- Incomplete batch, `K=9`, `T=2`: sheet 0 slots contain `0,2,4,6,8,blank,blank,blank`; sheet 1 contains `1,3,5,7,blank,blank,blank,blank`. Merging piles produces `0..8`.

Printer output direction and face are contractual assumptions, not inferred facts. A physical press whose output tray reverses sheets needs a new cut-stack profile version; the v1 profile must not be edited.

## Canonical identity

`batch_id` is `pb-{sha256}` over canonical input positions, format configurations, and algorithm/profile versions. `batch_sha256` hashes UTF-8 bytes of canonical batch JSON excluding only the `batch_sha256` field itself. Object keys are sorted by the shared canonical JSON implementation; arrays are already constructed in documented stable order. Undefined values, non-finite numbers, and unsupported types are rejected.

Operational fields such as `created_at`, `created_by`, and `frozen_at` are stored only in persistence headers and do not affect either canonical identity.

## Firestore model

```text
pod_production_batches/{batch_id}
pod_production_batch_chunks/{batch_id}-{chunk_index:000000}
pod_production_batch_memberships/pbm-{sha256(print_job_item_id)}
pod_production_batch_artifacts/{artifact_id}
```

The header starts as `BUILDING`. Reservation atomically creates the header and every immutable membership with `currentDocument.exists=false`. This gives one active batch assignment per `print_job_item_id`; retrying the same batch verifies identical claims, while overlap with another batch conflicts. The implementation reserves at most 450 positions in one atomic Firestore commit, below Firestore's 500-write transaction/commit limit.

Chunks contain at most 100 physical slots and at most 256 KiB of canonical UTF-8 document JSON, and are created with `exists:false`. A retry verifies and reuses matching chunks. Before the header changes to `FROZEN`, every chunk is reread, sequenced, hashed, reconstructed, and checked against `batch_sha256`; the state update uses the exact header `updateTime`. Frozen headers, chunks, memberships, hashes, and artifacts cannot be written by any client, including an administrator client.

The create flow performs all source reads before reservation writes. There are no GCS operations, URL requests, PDF rendering, or other external effects in the atomic reservation commit. After freezing, source manifests and asset sets are reread and must still derive the same batch ID and hash.

## PDF artifacts and reprints

Each compatible group has one immutable artifact ID derived from `batch_id` and `group_index`. The browser helper checks for this artifact before loading render sources. If it exists, reprint streams its exact pinned Storage generation and does not call the source loader, render React, run `html2canvas`/jsPDF, or fetch assets.

The first render consumes only caller-supplied, verified frozen render inputs and `LoadedPodPrintAssets`. It validates the render-input SHA-256 and asset-set ID/hash/profile for every position, follows batch sheet/slot order, leaves explicit blanks untouched, and uses front/back geometry recorded by the planner.

The content-addressed private GCS path is:

```text
pod-production-batch-artifacts/{batch_id}/group-{group_index:0000}/{batch_sha256}/{pdf_sha256}.pdf
```

Uploads use the existing GCS adapter with `ifGenerationMatch=0`. A `412` never overwrites: exact bytes, SHA-256, size, content type, batch/group IDs, profile versions, and hashes must match the existing object. The stored generation is recorded in Firestore and required for every reprint download; downloaded bytes are SHA-256 verified again.

## Failure recovery

- Before header: retry rebuilds the same deterministic package.
- Header without chunks or partial chunks: retry verifies reservation and creates only missing chunks.
- Frozen manifest without PDF: first-render artifact creation can resume independently.
- Lost response after Firestore/GCS success: fresh reads and integrity comparison turn an identical retry into success.
- Concurrent identical batches: workers converge on one header, memberships, chunks, and artifacts.
- Concurrent overlapping batches: the shared create-only membership makes one reservation fail atomically.
- Modified source after selection: the post-freeze source verification fails closed.
- Modified template/font after asset-set freeze: rendering uses generation-pinned frozen bytes; a mismatch fails asset verification.

## Physical proof requirements

Software tests cannot establish actual press/tray behavior. Before production use, run a numbered proof for every supported format and verify:

1. Short-edge duplex is configured on the press and matches the recorded back slots.
2. Output sheets arrive face up and in ascending sheet order.
3. The operator's stack top/bottom convention matches the v1 profile.
4. Row-major cuts and ascending pile merge recreate the numbered source sequence.
5. Crop marks, bleed, registration, paper rotation, and finishing tolerances are acceptable.

Any different physical workflow requires a new profile version and new batch; never reinterpret an existing frozen batch.
