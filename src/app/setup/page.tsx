import { PlacementTest } from "@/components/PlacementTest";
import { LANGUAGES } from "@/lib/languages";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>;
}) {
  // Only what the client needs. The language modules carry functions, which
  // would not survive serialisation across the server/client boundary.
  const languages = Object.values(LANGUAGES).map((l) => ({
    code: l.code,
    name: l.name,
    fontStack: l.fontStack,
  }));

  // `?language=` lets the switcher send someone straight into the check for a
  // specific language, rather than to a picker they have already answered.
  // Validated against the registry so a bad value falls back to asking.
  const { language } = await searchParams;
  const preselected = languages.find((l) => l.code === language) ?? null;

  return <PlacementTest languages={languages} preselected={preselected} />;
}
