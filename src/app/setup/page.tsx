import { PlacementTest } from "@/components/PlacementTest";
import { LANGUAGES } from "@/lib/languages";

export default function SetupPage() {
  // Only what the client needs. The language modules carry functions, which
  // would not survive serialisation across the server/client boundary.
  const languages = Object.values(LANGUAGES).map((l) => ({
    code: l.code,
    name: l.name,
    fontStack: l.fontStack,
  }));

  return <PlacementTest languages={languages} />;
}
