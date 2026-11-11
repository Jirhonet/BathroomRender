import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Planner } from "#/bathroom/Planner";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<ClientOnly
			fallback={
				<div className="flex h-dvh items-center justify-center bg-slate-200 text-sm text-slate-500">
					Loading 3D bathroom…
				</div>
			}
		>
			<Planner />
		</ClientOnly>
	);
}
