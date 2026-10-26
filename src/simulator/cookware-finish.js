// Only cookware uses this reflection rig; factory lighting and machine colors stay unchanged.
export function createCookwareReflection(THREE, pmrem) {
  const width = 512,
    height = 256,
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = y / height,
        at = (y * width + x) * 4;
      // Broad, continuous studio illumination: no rectangular strips or sharp edges.
      const longitude = 2 * Math.PI * u;
      const distance = (center) =>
        Math.min(Math.abs(u - center), 1 - Math.abs(u - center));
      const softbox = Math.exp(
        -Math.pow(distance(0.76) / 0.17, 2) - Math.pow((v - 0.43) / 0.38, 2),
      );
      const fill = Math.exp(
        -Math.pow(distance(0.12) / 0.23, 2) - Math.pow((v - 0.3) / 0.4, 2),
      );
      const value =
        90 +
        32 * Math.cos(longitude + 0.8) +
        20 * (1 - v) +
        80 * softbox +
        25 * fill;
      data[at] = value;
      data[at + 1] = Math.min(255, value + 4);
      data[at + 2] = Math.min(255, value + 9);
      data[at + 3] = 255;
    }
  const source = new THREE.DataTexture(data, width, height);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;
  const target = pmrem.fromEquirectangular(source);
  source.dispose();
  return target;
}
export function applyCookwareFinish(material, progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  material.roughness = 0.82 + (0.14 - 0.82) * p;
  material.metalness = 0.76 + (0.99 - 0.76) * p;
  material.envMapIntensity = 0.65 + (0.98 - 0.65) * p;
  material.color
    .setRGB(0.38, 0.42, 0.46)
    .lerp({ r: 0.68, g: 0.72, b: 0.76 }, p);
}
