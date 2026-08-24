// This is the only Vercel Function entrypoint. The implementation is bundled
// into _router.cjs before commit so imports outside api/ cannot be dropped.
const router = require("./_router.cjs");

module.exports = router.default || router;
