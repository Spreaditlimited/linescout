export function sureImportsSender(value: string) {
  const address = (value.match(/<([^<>]+)>/)?.[1] || value).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address)) throw new Error("Invalid sender address configuration");
  return { name: "Sure Imports", address };
}
