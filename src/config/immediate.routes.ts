import { Loading } from "../mainComponents/Loading";
import NotFoundPage from "../mainComponents/NotFoundPage";

// Routes bundled with the main chunk.
export const immediateRoutes = [{ path: "/loading", component: Loading }];

export const fallbackRoute = {
  path: "*",
  component: NotFoundPage,
};
