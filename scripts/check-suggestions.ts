/**
 * Assert the starting points stay broad and usable.
 *
 *   npm run suggestions
 *
 * The set is a breadth check as much as a convenience: every field appears as a
 * story, an article and a conversation, so weak terminology in one domain shows
 * up three times rather than once. That only holds if nobody quietly drops one,
 * which is what this is for.
 *
 * No LLM. It reads the list and nothing else.
 */
import { FIELDS, PLACEHOLDERS, SUGGESTIONS, type Field } from "../src/lib/suggestions";
import { FORMATS, type Format } from "../src/lib/formats";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const pass = a === e;
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`       expected ${e}\n       got      ${a}`);
}

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

console.log("--- every format is covered ---");
for (const format of FORMATS) {
  const list = SUGGESTIONS[format as Format];
  ok(`${format} has suggestions`, list.length > 0, `${list.length}`);
  ok(`${format} has a placeholder`, Boolean(PLACEHOLDERS[format as Format]));
}

console.log("\n--- every field appears in every format ---");
for (const format of FORMATS) {
  const covered = new Set(SUGGESTIONS[format as Format].map((s) => s.field));
  const missing = FIELDS.filter((f) => !covered.has(f));
  check(`${format} covers all ${FIELDS.length} fields`, missing, []);
}

console.log("\n--- and nothing is filed under a field that does not exist ---");
for (const format of FORMATS) {
  const strays = SUGGESTIONS[format as Format]
    .map((s) => s.field)
    .filter((f) => !FIELDS.includes(f as Field));
  check(`${format} uses only declared fields`, strays, []);
}

console.log("\n--- the entries themselves ---");
{
  const all = FORMATS.flatMap((f) => SUGGESTIONS[f as Format]);

  const labels = all.map((s) => s.label);
  check("no duplicate labels", labels.length - new Set(labels).size, 0);
  const topics = all.map((s) => s.topic);
  check("no duplicate topics", topics.length - new Set(topics).size, 0);

  // A chip that wraps to two lines breaks the row. Nothing enforced this before
  // and "Apologising for a delay" was already pushing it.
  const long = all.filter((s) => s.label.length > 26).map((s) => s.label);
  check("labels stay short enough for a chip", long, []);

  // A topic shorter than this is a category, not a premise - "Mexico" rather
  // than "an adventure in Mexico that goes wrong" - and produces a brochure.
  const thin = all.filter((s) => s.topic.split(/\s+/).length < 8).map((s) => s.label);
  check("every topic is a premise, not a category", thin, []);

  ok(
    "nothing is blank",
    all.every((s) => s.label.trim() && s.topic.trim()),
  );
}

console.log("\n--- the placeholder is an example, not one of the chips ---");
for (const format of FORMATS) {
  const placeholder = PLACEHOLDERS[format as Format];
  const clash = SUGGESTIONS[format as Format].some(
    (s) => s.topic === placeholder || s.label === placeholder,
  );
  ok(`${format} placeholder is its own`, !clash, placeholder);
  // Long enough to model the shape, short enough not to truncate in the box.
  ok(
    `${format} placeholder fits an input`,
    placeholder.length <= 52,
    `${placeholder.length} chars`,
  );
}

console.log(failures ? `\n${failures} failing` : "\nthe starting points are broad and usable");
process.exit(failures ? 1 : 0);
