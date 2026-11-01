// App: route table. Immediate routes ship in the main chunk, lazy routes load on demand.
import { Route, Routes } from "react-router-dom";
import { fallbackRoute, immediateRoutes } from "./config/immediate.routes";
import { lazyRoutes } from "./config/lazy.routes";
import { createImmediateRoute, createPublicRoute } from "./config/routeHelpers";

export function App() {
  return (
    <Routes>
      {/* IMMEDIATE — no lazy, no wrapper */}
      {immediateRoutes.map(({ path, component }) =>
        createImmediateRoute(path, component),
      )}
      {/* LAZY — code-split, <Loading /> while the chunk loads */}
      {lazyRoutes.map(({ path, component }) =>
        createPublicRoute(path, component),
      )}
      <Route path={fallbackRoute.path} element={<fallbackRoute.component />} />
    </Routes>
  );
}
