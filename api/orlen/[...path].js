// Keep ORLEN routes under their own Vercel catch-all function so nested
// /api/orlen/* paths are resolved consistently with the other integrations.
import bundledRouter from "../_router.cjs";

export default bundledRouter.default || bundledRouter;
