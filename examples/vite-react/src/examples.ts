// The five reference examples (A-E) shared by every HPB example app.
const files = import.meta.glob("../../fixtures/*.hpb", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

export interface Example {
  key: string;
  label: string;
  source: string;
}

export const examples: Example[] = Object.entries(files)
  .map(([path, source]) => {
    const file = path.split("/").pop()!.replace(/\.hpb$/, "");
    const [key, ...rest] = file.split("-");
    return { key, label: `${key} · ${rest.join(" ")}`, source };
  })
  .sort((a, b) => a.key.localeCompare(b.key));
