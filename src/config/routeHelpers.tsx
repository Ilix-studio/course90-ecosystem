import React, { Suspense } from "react";
import { Route } from "react-router-dom";
import { Loading } from "../mainComponents/Loading";

const RouteLoadingFallback: React.FC = () => <Loading fixed />;

const PublicRouteWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <>{children}</>;

export const createImmediateRoute = (
  path: string,
  Component: React.ComponentType,
) => <Route key={path} path={path} element={<Component />} />;

export const createPublicRoute = (
  path: string,
  Component: React.ComponentType,
) => (
  <Route
    key={path}
    path={path}
    element={
      <Suspense fallback={<RouteLoadingFallback />}>
        <PublicRouteWrapper>
          <Component />
        </PublicRouteWrapper>
      </Suspense>
    }
  />
);
