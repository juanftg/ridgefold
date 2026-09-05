import { createFileRoute } from "@tanstack/react-router";
import { RidgefoldApp } from "@/game/RidgefoldApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RidgefoldApp />;
}
