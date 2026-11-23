import { SessionDetailView } from "@/components/views/session-detail";
import { loadSnapshot } from "@/lib/snapshot";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadSnapshot().sessions.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = loadSnapshot().sessions.find((x) => x.id === id);
  return { title: `${s?.title ?? "Session"} · Claude Code Usage` };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetailView id={id} />;
}
