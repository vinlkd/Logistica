export const numberIn = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export const integerIn = (v, min, max) =>
  Number.isInteger(v) && numberIn(v, min, max);
export function safeData(value, depth = 0) {
  if (depth > 10) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number")
    return Number.isFinite(value) && Math.abs(value) < 1e12;
  if (typeof value === "string") return value.length <= 1000;
  if (Array.isArray(value))
    return value.length <= 2000 && value.every((v) => safeData(v, depth + 1));
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  return (
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([k, v]) =>
        !["__proto__", "constructor", "prototype"].includes(k) &&
        safeData(v, depth + 1),
    )
  );
}
export function validSettings(definition, settings) {
  if (!settings || typeof settings !== "object") return false;
  return (
    Object.keys(settings).length === definition.controls.length &&
    definition.controls.every((c) => {
      const v = settings[c.id];
      return c.type === "checkbox"
        ? typeof v === "boolean"
        : c.type === "select"
          ? c.options.some((o) => o.value === v)
          : numberIn(v, c.min ?? -1e6, c.max ?? 1e6);
    })
  );
}
