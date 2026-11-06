import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { createQueryClient } from "./queryClient";
import { createRoutes } from "./routes";

const queryClient = createQueryClient();
const router = createBrowserRouter(createRoutes(queryClient));

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
