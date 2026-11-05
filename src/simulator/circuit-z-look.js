export function createPreviewLook(
  canvas,
  { available, rotate, select, onEscape },
) {
  let requested = false;
  let active = false;
  let touch;

  function release() {
    requested = false;
    touch = undefined;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  async function capture() {
    if (!available() || requested || !canvas.requestPointerLock || matchMedia("(pointer: coarse)").matches) return;
    requested = true;
    try {
      await canvas.requestPointerLock();
    } catch {
      requested = false;
    }
  }

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    const escaped =
      active && !locked && requested && document.hasFocus() && !document.hidden;
    if (locked && (!requested || !available())) release();
    active = locked && requested;
    canvas.closest(".circuit").classList.toggle("z-look-locked", active);
    if (!locked) requested = false;
    if (escaped) onEscape();
  });
  document.addEventListener("pointerlockerror", () => {
    requested = false;
  });
  document.addEventListener("mousemove", (event) => {
    if (active && requested && available())
      rotate(event.movementX, event.movementY);
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!available()) return;
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      if (active && requested) select();
      else capture();
      return;
    }
    if (touch) return;
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!touch || event.pointerId !== touch.id || !available()) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
    touch.travel += Math.hypot(dx, dy);
    if (touch.travel > 8) rotate(dx, dy);
    touch.x = event.clientX;
    touch.y = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!touch || event.pointerId !== touch.id) return;
    if (touch.travel <= 8 && available()) {
      const rect = canvas.getBoundingClientRect();
      select({
        x: 2 * (event.clientX - rect.left) / rect.width - 1,
        y: 1 - 2 * (event.clientY - rect.top) / rect.height,
      });
    }
    touch = undefined;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === touch?.id) touch = undefined;
  });
  window.addEventListener("blur", release);
  window.addEventListener("pagehide", release);
  return { capture, release };
}

export function createPreviewStick(container) {
  const axis = { x: 0, y: 0, reset() {} };
  if (!matchMedia("(pointer: coarse)").matches) return axis;
  const pad = document.createElement("div");
  pad.className = "z-stick";
  pad.setAttribute("aria-label", "Joystick de movimento");
  const knob = document.createElement("span");
  pad.append(knob);
  container.append(pad);
  let pointer;
  axis.reset = () => {
    axis.x = axis.y = 0;
    knob.style.transform = "";
    const captured = pointer;
    pointer = undefined;
    if (captured !== undefined && pad.hasPointerCapture(captured)) pad.releasePointerCapture(captured);
  };
  function move(event) {
    if (event.pointerId !== pointer) return;
    const r = pad.getBoundingClientRect(), radius = r.width * 0.32;
    const dx = event.clientX - r.left - r.width / 2;
    const dy = event.clientY - r.top - r.height / 2;
    const distance = Math.hypot(dx, dy);
    const scale = distance < 5 ? 0 : 1 / Math.max(radius, distance);
    axis.x = dx * scale;
    axis.y = dy * scale;
    knob.style.transform = `translate(${axis.x * radius}px, ${axis.y * radius}px)`;
  }
  pad.addEventListener("pointerdown", (event) => {
    if (pointer !== undefined || event.pointerType !== "touch") return;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    move(event);
  });
  pad.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    pad.addEventListener(type, (event) => { if (event.pointerId === pointer) axis.reset(); });
  return axis;
}
