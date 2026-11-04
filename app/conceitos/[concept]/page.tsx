import { notFound } from "next/navigation";
import { CONCEPTS } from "../data";
import ConceptExperience from "../ui/ConceptExperience";

export function generateStaticParams() { return CONCEPTS.map(c => ({ concept: c.id })); }
export const dynamicParams = false;

export default async function ConceptPage({ params }: { params: Promise<{ concept: string }> }) {
  const { concept } = await params;
  const selected = CONCEPTS.find(c => c.id === concept);
  if (!selected) notFound();
  return <ConceptExperience concept={selected} />;
}
