// Vercel discovers JavaScript entrypoints in api/.  The implementation is
// deliberately bundled into _router.cjs so this project uses one function.
import bundledRouter from "./_router.cjs";

export default bundledRouter.default || bundledRouter;
