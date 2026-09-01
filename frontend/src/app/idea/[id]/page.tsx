import IdeaSpace from "@/components/idea/IdeaSpace";

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IdeaSpace id={id} />;
}
