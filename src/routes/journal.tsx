import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/journal")({
  ssr: false,
  component: JournalRedirect,
});

function JournalRedirect() {
  return <Navigate to="/notities" replace />;
}