const pdfjsLib = window.pdfjsLib;
const pdfAssetBase = chrome?.runtime?.getURL("") || ".";
const pdfWorkerSrc = `${pdfAssetBase}lib/pdf.worker.min.js`;
const pdfCMapUrl = `${pdfAssetBase}lib/cmaps/`;
const pdfStandardFontDataUrl = `${pdfAssetBase}lib/standard_fonts/`;

if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}

const A4 = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
};
const maxImageEdge = 2400;
const tallImageRatio = 1.75;
const tallImageAutoPerSheet = 4;
const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const state = {
  invoices: [],
  layoutMode: "auto",
  orientation: "landscape",
  pageMargin: 8,
  itemGap: 5,
  invoiceScale: 100,
  showGuides: true,
  showCropMarks: true,
};

const elements = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  layoutMode: document.querySelector("#layoutMode"),
  orientation: document.querySelector("#orientation"),
  pageMargin: document.querySelector("#pageMargin"),
  itemGap: document.querySelector("#itemGap"),
  invoiceScale: document.querySelector("#invoiceScale"),
  showGuides: document.querySelector("#showGuides"),
  showCropMarks: document.querySelector("#showCropMarks"),
  marginValue: document.querySelector("#marginValue"),
  gapValue: document.querySelector("#gapValue"),
  scaleValue: document.querySelector("#scaleValue"),
  printButton: document.querySelector("#printButton"),
  clearButton: document.querySelector("#clearButton"),
  preview: document.querySelector("#preview"),
  summary: document.querySelector("#summary"),
  status: document.querySelector("#status"),
};

const printPageStyle = document.createElement("style");
document.head.appendChild(printPageStyle);

bindEvents();
applySettings();
renderPreview();
ensurePdfRenderer();

function bindEvents() {
  elements.fileInput.addEventListener("change", (event) => {
    loadFiles(Array.from(event.target.files));
    event.target.value = "";
  });

  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });

  elements.dropZone.addEventListener("dragleave", () => {
    elements.dropZone.classList.remove("dragging");
  });

  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    const files = Array.from(event.dataTransfer.files).filter(isSupportedFile);
    loadFiles(files);
  });

  elements.layoutMode.addEventListener("change", (event) => {
    state.layoutMode = event.target.value;
    renderPreview();
  });

  elements.orientation.addEventListener("change", (event) => {
    state.orientation = event.target.value;
    applySettings();
    renderPreview();
  });

  elements.pageMargin.addEventListener("input", (event) => {
    state.pageMargin = Number(event.target.value);
    applySettings();
  });

  elements.itemGap.addEventListener("input", (event) => {
    state.itemGap = Number(event.target.value);
    applySettings();
  });

  elements.invoiceScale.addEventListener("input", (event) => {
    state.invoiceScale = Number(event.target.value);
    applySettings();
  });

  elements.showGuides.addEventListener("change", (event) => {
    state.showGuides = event.target.checked;
    renderPreview();
  });

  elements.showCropMarks.addEventListener("change", (event) => {
    state.showCropMarks = event.target.checked;
    renderPreview();
  });

  elements.printButton.addEventListener("click", () => {
    window.print();
  });

  elements.clearButton.addEventListener("click", () => {
    state.invoices = [];
    renderPreview();
  });
}

async function loadFiles(files) {
  const supportedFiles = files.filter(isSupportedFile);

  if (!supportedFiles.length) {
    setStatus("没有找到支持的 PDF 或图片文件。");
    return;
  }

  setBusy(true);
  setStatus(`正在解析 ${supportedFiles.length} 个文件...`);

  try {
    const loadedGroups = [];
    for (const file of supportedFiles) {
      loadedGroups.push(...(await renderFile(file)));
    }

    state.invoices.push(...loadedGroups);
    renderPreview();
  } catch (error) {
    console.error(error);
    setStatus("文件解析失败，请确认 PDF 未损坏、未加密，或图片格式受支持。");
  } finally {
    setBusy(false);
  }
}

async function renderFile(file) {
  if (isPdfFile(file)) {
    if (!pdfjsLib) {
      throw new Error("PDF 渲染库加载失败");
    }

    return renderPdfFile(file);
  }

  return [await renderImageFile(file)];
}

async function renderPdfFile(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    cMapPacked: true,
    cMapUrl: pdfCMapUrl,
    standardFontDataUrl: pdfStandardFontDataUrl,
    useSystemFonts: true,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`正在渲染 ${file.name} 第 ${pageNumber}/${pdf.numPages} 页...`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 2400;
    const scale = Math.min(4, Math.max(2, targetWidth / viewport.width));
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.ceil(scaledViewport.width);
    canvas.height = Math.ceil(scaledViewport.height);

    await page.render({
      canvasContext: context,
      intent: "print",
      viewport: scaledViewport,
    }).promise;

    pages.push({
      kind: "pdf",
      name: pdf.numPages > 1 ? `${file.name} - ${pageNumber}` : file.name,
      dataUrl: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}

async function renderImageFile(file) {
  setStatus(`正在处理图片 ${file.name}...`);

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxImageEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return {
      kind: "image",
      name: file.name,
      dataUrl: canvas.toDataURL("image/png"),
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = url;
  });
}

function applySettings() {
  const size = A4[state.orientation];
  document.documentElement.style.setProperty("--page-width", `${size.width}mm`);
  document.documentElement.style.setProperty("--page-height", `${size.height}mm`);
  document.documentElement.style.setProperty("--page-margin", `${state.pageMargin}mm`);
  document.documentElement.style.setProperty("--item-gap", `${state.itemGap}mm`);
  document.documentElement.style.setProperty(
    "--invoice-scale",
    String(state.invoiceScale / 100),
  );
  printPageStyle.textContent = `@page { size: A4 ${state.orientation}; margin: 0; }`;

  elements.marginValue.value = `${state.pageMargin} mm`;
  elements.gapValue.value = `${state.itemGap} mm`;
  elements.scaleValue.value = `${state.invoiceScale}%`;
}

function renderPreview() {
  applySettings();

  const count = state.invoices.length;
  elements.preview.innerHTML = "";
  elements.preview.classList.toggle("empty", count === 0);
  elements.preview.classList.toggle("hide-guides", !state.showGuides);
  elements.preview.classList.toggle("hide-crop-marks", !state.showCropMarks);
  elements.printButton.disabled = count === 0;
  elements.clearButton.disabled = count === 0;

  if (!count) {
    elements.summary.textContent = "尚未上传发票";
    elements.status.textContent = "请选择 PDF 或图片文件开始排版。";
    elements.preview.appendChild(createEmptyState());
    return;
  }

  const pages = resolvePages();

  elements.summary.textContent = `${count} 张票据，${pages.length} 页 A4`;
  elements.status.textContent = formatLayoutStatus(pages);

  for (const page of pages) {
    elements.preview.appendChild(
      createSheet(page.invoices, page.perSheet, page.orientation),
    );
  }
}

function resolvePages() {
  if (state.layoutMode !== "auto") {
    const perSheet = Number(state.layoutMode);
    return chunk(state.invoices, perSheet).map((invoices) => ({
      invoices,
      perSheet,
      orientation: state.orientation,
    }));
  }

  return createAutoPages(state.invoices);
}

function createAutoPages(invoices) {
  const pages = [];
  let pending = [];
  let pendingTallImages = [];

  for (const invoice of invoices) {
    if (isTallImage(invoice)) {
      flushPendingAutoPage(pages, pending);
      pending = [];
      pendingTallImages.push(invoice);
      if (pendingTallImages.length === tallImageAutoPerSheet) {
        flushTallImagePage(pages, pendingTallImages);
        pendingTallImages = [];
      }
      continue;
    }

    flushTallImagePage(pages, pendingTallImages);
    pendingTallImages = [];
    pending.push(invoice);
    if (pending.length === 4) {
      pages.push({ invoices: pending, perSheet: 4, orientation: state.orientation });
      pending = [];
    }
  }

  flushTallImagePage(pages, pendingTallImages);
  flushPendingAutoPage(pages, pending);
  return pages;
}

function flushTallImagePage(pages, pendingTallImages) {
  if (!pendingTallImages.length) {
    return;
  }

  pages.push({
    invoices: pendingTallImages,
    perSheet: pendingTallImages.length <= 2 ? 2 : 4,
    orientation: "landscape",
  });
}

function flushPendingAutoPage(pages, pending) {
  if (!pending.length) {
    return;
  }

  pages.push({
    invoices: pending,
    perSheet: pending.length === 1 ? 1 : pending.length === 2 ? 2 : 4,
    orientation: state.orientation,
  });
}

function isTallImage(invoice) {
  return invoice.kind === "image" && invoice.height / invoice.width >= tallImageRatio;
}

function formatLayoutStatus(pages) {
  if (state.layoutMode !== "auto") {
    return `当前每页 ${state.layoutMode} 张，${formatOrientation()}。`;
  }

  const hasTallImagePage = pages.some(
    (page) => page.invoices.some(isTallImage),
  );

  return hasTallImagePage
    ? `自动排版：付款截图等长图按横向 A4 密集排版，普通票据按 ${formatOrientation()} 合并排版。`
    : `自动排版：普通票据合并排版，${formatOrientation()}。`;
}

function createSheet(invoices, perSheet, orientation) {
  const sheet = document.createElement("article");
  sheet.className = `sheet layout-${perSheet} ${orientation}`;

  for (const invoice of invoices) {
    const frame = document.createElement("figure");
    frame.className = "invoice-frame";

    const image = document.createElement("img");
    image.className = "invoice-image";
    image.src = invoice.dataUrl;
    image.alt = invoice.name;
    image.loading = "lazy";

    frame.appendChild(image);
    sheet.appendChild(frame);
  }

  const placeholders = perSheet - invoices.length;
  for (let index = 0; index < placeholders; index += 1) {
    const placeholder = document.createElement("div");
    placeholder.className = "invoice-frame invoice-placeholder";
    sheet.appendChild(placeholder);
  }

  return sheet;
}

function createEmptyState() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const title = document.createElement("strong");
  title.textContent = "等待 PDF 或图片发票";

  const subtitle = document.createElement("span");
  subtitle.textContent = "上传后会在这里生成 A4 打印预览。";

  wrapper.appendChild(title);
  wrapper.appendChild(subtitle);
  return wrapper;
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function setBusy(isBusy) {
  document.body.classList.toggle("loading", isBusy);
  elements.fileInput.disabled = isBusy;
  elements.printButton.disabled = isBusy || state.invoices.length === 0;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function formatOrientation() {
  return state.orientation === "portrait" ? "纵向 A4" : "横向 A4";
}

function ensurePdfRenderer() {
  if (pdfjsLib) {
    return;
  }

  setStatus("PDF 渲染库加载失败，仍可上传图片；如需处理 PDF，请尝试重新加载插件。");
}

function isSupportedFile(file) {
  return isPdfFile(file) || supportedImageTypes.has(file.type);
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
