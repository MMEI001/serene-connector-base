import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/reminders/$id")({
  ssr: false,
  component: () => <Outlet />,
});
