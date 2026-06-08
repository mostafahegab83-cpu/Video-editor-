// Video Editor — vanilla JS using FFmpeg.wasm
import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import { toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js";

const $ = (id) => document.getElementById(id);

const dropZone = $("dropZone");
const placeholder = $("placeholder");
const video = $("video");
const fileInput = $("fileInput");
const clipsBox = $("clipsBox");
const clipList = $("clipList");
const clipCount = $("clipCount");

const btnTrim = $("btnTrim");
const btnMerge = $("btnMerge");
const btnText = $("btnText");
const btnExport = $("btnExport");
const trimFrom = $("trimFrom");
const trimTo = $("trimTo");
const textValue = $("textValue");
const textFrom = $("textFrom");
const textTo = $("textTo");
const downloadLink = $("downloadLink");

const playBtn = $("playBtn");
const muteBtn = $("muteBtn");
const seek = $("seek");
const timeEl = $("time");
const statusEl = $("status");

let files = [];
let activeIdx = 0;
let currentURL = "";
let ffmpeg = null;

function setStatus(msg, busy = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("busy", !!busy);
}

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  setStatus("Loading FFmpeg engine (~25 MB)...", true);
  const ff = new FFmpeg();
  ff.on("log", ({ message }) => setStatus(message, true));
  const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  const ffmpegBase = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm";
  // Load all resources as same-origin blob URLs so the Worker script
  // is not blocked by cross-origin Worker restrictions (e.g. GitHub Pages).
  await ff.load({
    coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
    classWorkerURL: await toBlobURL(`${ffmpegBase}/worker.js`, "text/javascript"),
  });
  ffmpeg = ff;
  setStatus("FFmpeg ready.");
  return ff;
}

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function refreshButtons() {
  const has = files.length > 0;
  btnTrim.disabled = !has;
  btnText.disabled = !has;
  btnExport.disabled = !has;
  btnMerge.disabled = files.length < 2;
  playBtn.disabled = !has;
  muteBtn.disabled = !has;
  seek.disabled = !has;
}

function renderClips() {
  clipCount.textContent = files.length;
  clipsBox.classList.toggle("hidden", files.length === 0);
  clipList.innerHTML = "";
  files.forEach((f, i) => {
    const li = document.createElement("li");
    const name = document.createElement("button");
    name.className = "name" + (i === activeIdx ? " active" : "");
    name.textContent = `${i + 1}. ${f.name}`;
    name.onclick = () => { activeIdx = i; loadActive(); };
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "✕";
    rm.onclick = () => {
      files.splice(i, 1);
      if (activeIdx >= files.length) activeIdx = Math.max(0, files.length - 1);
      loadActive();
    };
    li.append(name, rm);
    clipList.appendChild(li);
  });
}

function loadActive() {
  if (currentURL) URL.revokeObjectURL(currentURL);
  if (!files[activeIdx]) {
    placeholder.classList.remove("hidden");
    video.classList.add("hidden");
    video.removeAttribute("src");
  } else {
    currentURL = URL.createObjectURL(files[activeIdx]);
    video.src = currentURL;
    video.classList.remove("hidden");
    placeholder.classList.add("hidden");
  }
  renderClips();
  refreshButtons();
}

function addFiles(list) {
  const arr = Array.from(list || []).filter((f) => f.type.startsWith("video/"));
  if (!arr.length) return;
  files.push(...arr);
  loadActive();
}

// File input + drag/drop
fileInput.addEventListener("change", (e) => addFiles(e.target.files));
["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); }),
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); }),
);
dropZone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

// Player
video.addEventListener("loadedmetadata", () => {
  seek.max = video.duration || 0;
  timeEl.textContent = `${fmt(0)} / ${fmt(video.duration)}`;
});
video.addEventListener("timeupdate", () => {
  seek.value = video.currentTime;
  timeEl.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
});
video.addEventListener("play", () => (playBtn.textContent = "⏸"));
video.addEventListener("pause", () => (playBtn.textContent = "▶"));
playBtn.onclick = () => (video.paused ? video.play() : video.pause());
seek.oninput = () => { video.currentTime = parseFloat(seek.value); };
muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
};

// Helpers
async function fileBytes(f) {
  return new Uint8Array(await f.arrayBuffer());
}
function offerDownload(data, name) {
  const blob = new Blob([data], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = name;
  downloadLink.textContent = `Download ${name}`;
  downloadLink.classList.remove("hidden");
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
}

async function withBusy(fn) {
  [btnTrim, btnMerge, btnText, btnExport].forEach((b) => (b.disabled = true));
  try { await fn(); }
  catch (e) { setStatus("Failed: " + e.message); }
  finally { refreshButtons(); }
}

// Trim
btnTrim.onclick = () => withBusy(async () => {
  const from = parseFloat(trimFrom.value) || 0;
  const to = parseFloat(trimTo.value) || 0;
  if (to <= from) { setStatus("Trim 'To' must be greater than 'From'."); return; }
  setStatus("Trimming...", true);
  const ff = await getFFmpeg();
  await ff.writeFile("in.mp4", await fileBytes(files[activeIdx]));
  await ff.exec(["-ss", String(from), "-to", String(to), "-i", "in.mp4", "-c", "copy", "out.mp4"]);
  const out = await ff.readFile("out.mp4");
  offerDownload(out, "trimmed.mp4");
  setStatus("Trim complete.");
});

// Merge
btnMerge.onclick = () => withBusy(async () => {
  if (files.length < 2) { setStatus("Add at least 2 videos."); return; }
  setStatus("Merging...", true);
  const ff = await getFFmpeg();
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    const src = `m${i}.mp4`, ts = `n${i}.ts`;
    await ff.writeFile(src, await fileBytes(files[i]));
    await ff.exec([
      "-i", src, "-c:v", "libx264", "-c:a", "aac", "-b:a", "128k",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-r", "30", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", ts,
    ]);
    parts.push(ts);
  }
  await ff.exec(["-i", `concat:${parts.join("|")}`, "-c", "copy", "-bsf:a", "aac_adtstoasc", "merged.mp4"]);
  const out = await ff.readFile("merged.mp4");
  offerDownload(out, "merged.mp4");
  setStatus("Merge complete.");
});

// Text overlay
btnText.onclick = () => withBusy(async () => {
  const txt = textValue.value.trim();
  if (!txt) { setStatus("Enter overlay text."); return; }
  const from = parseFloat(textFrom.value) || 0;
  const to = parseFloat(textTo.value) || 0;
  if (to <= from) { setStatus("Text 'To' must be greater than 'From'."); return; }
  setStatus("Rendering text overlay...", true);
  const ff = await getFFmpeg();
  await ff.writeFile("in.mp4", await fileBytes(files[activeIdx]));
  const safe = txt.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const filter = `drawtext=text='${safe}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-40:enable='between(t,${from},${to})'`;
  await ff.exec(["-i", "in.mp4", "-vf", filter, "-c:a", "copy", "out.mp4"]);
  const out = await ff.readFile("out.mp4");
  offerDownload(out, "text-overlay.mp4");
  setStatus("Text overlay complete.");
});

// Export
btnExport.onclick = () => withBusy(async () => {
  setStatus("Exporting MP4...", true);
  const ff = await getFFmpeg();
  await ff.writeFile("in.mp4", await fileBytes(files[activeIdx]));
  await ff.exec(["-i", "in.mp4", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", "out.mp4"]);
  const out = await ff.readFile("out.mp4");
  offerDownload(out, "export.mp4");
  setStatus("Export complete.");
});

refreshButtons();
