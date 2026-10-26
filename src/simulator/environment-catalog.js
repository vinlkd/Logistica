export const ENVIRONMENT_CATALOG = [
  {
    id: "cookware",
    name: "Panelas",
    subtitle: "Transformação do metal",
    description:
      "Da conferência dos discos de inox ao pedido expedido, em oito setores.",
    color: "#164193",
  },
  {
    id: "beverages",
    name: "Fábrica de bebidas",
    subtitle: "Envase e qualidade",
    description:
      "Lave, encha, tampe e confira as garrafas antes de encaixotar.",
    color: "#087f82",
  },
];

export function resolveEnvironment(id) {
  return (
    ENVIRONMENT_CATALOG.find((environment) => environment.id === id) ?? null
  );
}
