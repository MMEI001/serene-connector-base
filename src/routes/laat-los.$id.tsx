import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/laat-los/$id")({
  ssr: false,
  component: () => <Outlet />,
});
