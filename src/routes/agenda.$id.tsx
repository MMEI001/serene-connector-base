import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/agenda/$id")({
  ssr: false,
  component: () => <Outlet />,
});
