export type TextVars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{name}` placeholders. Unknown placeholders stay visible so a typo in an edited text is easy to spot. */
export function fillTemplate(template: string, vars?: TextVars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => `{${match[1]}}`))];
}
