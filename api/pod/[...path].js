// Vercel's filesystem catch-all is scoped to one route segment.  POD routes
// are nested under /api/pod/, so they need their own function entrypoint.
import bundledRouter from "../_router.cjs";

export default bundledRouter.default || bundledRouter;
