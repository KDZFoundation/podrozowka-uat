# POD font sources and licenses

The deterministic POD renderer uses font binaries published by Fontsource 5.3.0. The generated registry records exact versioned CDN URLs and SHA-256 values; runtime code accepts no unpinned font bytes.

Families:

- Noto Sans and the Arabic, Armenian, Hebrew, Khmer, Lao, Ethiopic, Thai, Georgian, Tifinagh, Japanese, Korean, Hong Kong, Simplified Chinese and Traditional Chinese variants.
- Patrick Hand for the Latin photo-author annotation, with Noto fallbacks for unsupported scripts.

Noto and Patrick Hand are distributed under the SIL Open Font License 1.1. The authoritative license files are included in the corresponding versioned Fontsource packages and upstream repositories:

- <https://fontsource.org/>
- <https://github.com/google/fonts>
- <https://openfontlicense.org/>

Regenerate `src/lib/podFontRegistry.generated.ts` only with:

```text
node scripts/generate-pod-font-registry.mjs
```

Any package-version or byte change requires review, a new registry version, a new POD render-profile version and a new renderer version before release.
