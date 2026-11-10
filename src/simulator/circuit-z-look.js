export function createPreviewLook(canvas, { available, rotate, select }) {
  let touch;
  let mouse;

  function release() {
    touch = undefined;
    mouse = undefined;
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: 2 * (event.clientX - rect.left) / rect.width - 1,
      y: 1 - 2 * (event.clientY - rect.top) / rect.height,
    };
  }

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") {
      if (mouse && available())
        rotate(event.clientX - mouse.x, event.clientY - mouse.y);
      mouse = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!touch || event.pointerId !== touch.id || !available()) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
    touch.travel += Math.hypot(dx, dy);
    if (touch.travel > 8) rotate(dx, dy);
    touch.x = event.clientX;
    touch.y = event.clientY;
  });
  canvas.addEventListener("pointerleave", () => { mouse = undefined; });
  canvas.addEventListener("pointerdown", (event) => {
    if (!available()) return;
    if (event.pointerType === "mouse") {
      if (event.button === 0) mouse = { x: event.clientX, y: event.clientY };
      return;
    }
    if (touch) return;
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("click", (event) => {
    if (available() && event.pointerType === "mouse") select(point(event));
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!touch || event.pointerId !== touch.id) return;
    if (touch.travel <= 8 && available()) select(point(event));
    touch = undefined;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === touch?.id) touch = undefined;
  });
  window.addEventListener("blur", release);
  window.addEventListener("pagehide", release);
  return { capture: () => canvas.focus({ preventScroll: true }), release };
}
