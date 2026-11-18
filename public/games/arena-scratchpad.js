const labels = {
  en: {
    title: "Scratchpad",
    pen: "Pen",
    eraser: "Eraser",
    clear: "Clear",
    close: "Back",
    canvas: "Scratch paper: draw with a pen, finger, or mouse",
  },
  zh: {
    title: "草稿纸",
    pen: "画笔",
    eraser: "擦除",
    clear: "清空",
    close: "收起",
    canvas: "草稿纸，可用手指或笔书写",
  },
};

export function normalizedPoint(event, rect) {
  return {
    x: Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)),
    ),
    y: Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)),
    ),
  };
}

export function paintSegment(context, stroke, from, to, width, height) {
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = "#1d2b53";
  context.fillStyle = "#1d2b53";
  context.lineWidth = stroke.tool === "eraser" ? 22 : 2.5;
  context.lineCap = context.lineJoin = "round";
  if (from === to) {
    context.beginPath();
    context.arc(
      to.x * width,
      to.y * height,
      context.lineWidth / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  }
}

export function installScratchpad(document) {
  const stage = document.querySelector(".stagewrap");
  const overlay = document.getElementById("ov");
  if (!stage || !overlay || document.getElementById("arena-scratchpad")) return;
  const words =
    labels[document.documentElement.lang.startsWith("zh") ? "zh" : "en"];
  const style = document.createElement("style");
  style.textContent = `
    .scratch-open{flex:none!important;margin-left:4px;padding:4px 8px!important;min-height:32px;font-size:11px!important;white-space:nowrap}
    #arena-scratchpad{position:fixed;inset:0;box-sizing:border-box;width:min(900px,calc(100vw - 24px));height:min(620px,calc(100dvh - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);padding:12px;margin:auto;border:3px solid var(--muted);background:var(--panel);color:var(--text);box-shadow:6px 6px 0 var(--shade);font-family:var(--pix)}
    #arena-scratchpad[open]{display:flex;flex-direction:column;gap:10px}
    #arena-scratchpad::backdrop{background:transparent}
    .scratch-toolbar{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap}
    .scratch-toolbar strong{font-size:14px;flex:1;min-width:70px}
    .scratch-toolbar button{min-height:40px;min-width:44px;padding:6px 10px;font:12px var(--pix);touch-action:manipulation}
    .scratch-toolbar button[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--yellow);color:var(--yellow)}
    .scratch-surface{flex:1;min-height:0;position:relative;border:2px solid var(--muted);background:#fffdf5;background-image:linear-gradient(#1d2b5312 1px,transparent 1px),linear-gradient(90deg,#1d2b5312 1px,transparent 1px);background-size:24px 24px}
    .scratch-surface canvas{display:block;width:100%;height:100%;touch-action:none;user-select:none;cursor:crosshair}
    @media(max-width:500px),(max-height:450px){#arena-scratchpad{padding:8px;gap:6px}.scratch-toolbar{gap:4px}.scratch-toolbar button{padding:5px 8px}.scratch-toolbar strong{font-size:12px}}
  `;
  style.textContent += `
    #arena-scratchpad{inset:auto;margin:0;width:min(480px,78vw);height:min(350px,60dvh)}
    #arena-scratchpad[data-size="0"]{width:min(350px,70vw);height:min(240px,50dvh)}
    #arena-scratchpad[data-size="2"]{width:min(800px,94vw);height:min(570px,87dvh)}
    .scratch-toolbar strong{cursor:grab;touch-action:none;user-select:none}
  `;
  document.head.append(style);
  const dialog = document.createElement("dialog");
  dialog.id = "arena-scratchpad";
  dialog.setAttribute("aria-label", words.title);
  const toolbar = document.createElement("div");
  toolbar.className = "scratch-toolbar";
  const title = document.createElement("strong");
  title.textContent = "⠿ " + words.title;
  toolbar.append(title);
  let tool = "pen",
    active = null,
    question = null,
    opener = null;
  let strokes = [],
    queue = [],
    frame = 0,
    drawWidth = 0,
    drawHeight = 0;
  const buttons = {};
  for (const action of ["pen", "eraser", "clear", "close"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = words[action];
    button.dataset.scratchAction = action;
    toolbar.append(button);
    buttons[action] = button;
  }
  const sizes =
    words === labels.zh ? ["小", "中", "大"] : ["Small", "Medium", "Large"];
  const sizeButton = document.createElement("button");
  toolbar.insertBefore(sizeButton, buttons.pen);
  let size = 1,
    position = null,
    drag = null;
  sizeButton.textContent = sizes[size];
  function place() {
    if (!dialog.open) return;
    const { width, height } = dialog.getBoundingClientRect();
    dialog.style.left =
      Math.max(
        0,
        Math.min(position?.x ?? innerWidth - width - 8, innerWidth - width),
      ) + "px";
    dialog.style.top =
      Math.max(
        0,
        Math.min(position?.y ?? innerHeight - height - 8, innerHeight - height),
      ) + "px";
  }
  sizeButton.onclick = () => {
    size = (size + 1) % sizes.length;
    sizeButton.textContent = sizes[size];
    dialog.dataset.size = size;
    place();
  };
  title.onpointerdown = (e) => {
    if (drag || e.button !== 0) return;
    const rect = dialog.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    title.setPointerCapture(e.pointerId);
  };
  title.onpointermove = (e) => {
    if (drag?.id !== e.pointerId) return;
    position = { x: e.clientX - drag.x, y: e.clientY - drag.y };
    place();
  };
  title.onlostpointercapture = () => {
    drag = null;
  };
  window.addEventListener("resize", place);
  function selectTool(next) {
    tool = next;
    for (const action of ["pen", "eraser"])
      buttons[action].setAttribute("aria-pressed", String(tool === action));
  }
  buttons.pen.onclick = () => selectTool("pen");
  buttons.eraser.onclick = () => selectTool("eraser");
  selectTool("pen");
  const surface = document.createElement("div");
  surface.className = "scratch-surface";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", words.canvas);
  surface.append(canvas);
  dialog.append(toolbar, surface);
  // Native-fullscreen content must remain a descendant of the fullscreen stage.
  stage.append(dialog);
  const context = canvas.getContext("2d");
  function flush() {
    frame = 0;
    for (const item of queue)
      paintSegment(
        context,
        item.stroke,
        item.from,
        item.to,
        drawWidth,
        drawHeight,
      );
    queue = [];
  }
  function clear() {
    active = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    queue = [];
    strokes = [];
    context.clearRect(0, 0, drawWidth, drawHeight);
  }
  buttons.clear.onclick = clear;
  buttons.close.onclick = () => dialog.close();
  function resize() {
    if (!dialog.open) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)),
      height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (
      drawWidth === width &&
      drawHeight === height &&
      canvas.width === Math.round(width * ratio)
    )
      return;
    active = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    queue = [];
    drawWidth = width;
    drawHeight = height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const stroke of strokes)
      for (let index = 0; index < stroke.points.length; index++) {
        paintSegment(
          context,
          stroke,
          stroke.points[Math.max(0, index - 1)],
          stroke.points[index],
          width,
          height,
        );
      }
  }
  new ResizeObserver(resize).observe(surface);
  function addPoint(stroke, point) {
    const previous = stroke.points.at(-1) || point;
    stroke.points.push(point);
    queue.push({ stroke, from: previous, to: point });
    if (!frame) frame = requestAnimationFrame(flush);
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (active || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const stroke = { tool, points: [] };
    strokes.push(stroke);
    active = { id: event.pointerId, stroke };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    addPoint(stroke, normalizedPoint(event, canvas.getBoundingClientRect()));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const point of event.getCoalescedEvents?.().length
      ? event.getCoalescedEvents()
      : [event]) {
      addPoint(active.stroke, normalizedPoint(point, rect));
    }
  });
  const finish = (event) => {
    if (active?.id !== event.pointerId) return;
    active = null;
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  };
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(name, finish);
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  for (const name of ["pointerdown", "pointermove", "pointerup", "click"])
    dialog.addEventListener(name, (event) => event.stopPropagation());
  dialog.addEventListener("close", () => {
    active = null;
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
    opener?.isConnected && opener.focus({ preventScroll: true });
  });
  function sync() {
    const stem = ["quiz", "quizfb"].includes(document.body.dataset.ov)
      ? overlay.querySelector(".qstem")
      : null;
    if (stem !== question) {
      if (dialog.open) dialog.close();
      clear();
      question = stem;
    }
    if (!stem) return;
    const header = stem.closest(".panel")?.querySelector(".qhd");
    if (!header || header.querySelector(".scratch-open")) return;
    opener = document.createElement("button");
    opener.type = "button";
    opener.className = "scratch-open";
    opener.textContent = words.title;
    opener.onclick = () => {
      dialog.showModal();
      place();
      resize();
      buttons.pen.focus({ preventScroll: true });
    };
    header.append(opener);
  }
  new MutationObserver(sync).observe(overlay, {
    childList: true,
    subtree: true,
  });
  sync();
}

if (typeof document !== "undefined") installScratchpad(document);
