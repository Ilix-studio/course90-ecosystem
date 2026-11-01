import { lazy } from "react";

// Routes code-split: each chunk loads on first visit (App shows <Loading /> meanwhile).
export const lazyRoutes = [{ path: "/", component: lazy(() => import("../Home/Home")) }];
