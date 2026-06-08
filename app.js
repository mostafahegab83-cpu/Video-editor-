// Video Editor — standalone JavaScript.
// IMPORTANT: Keep these files in the same folder on GitHub Pages / hosting:
// index.html, styles.css, app.js, logo.png, ffmpeg.min.js, ffmpeg-core.js,
// ffmpeg-core.wasm, ffmpeg-core.worker.js

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
let ffmpegLoading = null;
let busy = false;

function setStatus(msg, isBusy = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("busy", !!isBusy);
}

function failMessage(error) {
  const message = error && error.message ? error.message : String(error || "Unknown error");
  if (location.protocol === "file:") {
    return "FFmpeg cannot load from a file opened directly. Upload the folder to GitHub Pages, or run it with a local web server.";
  }
  if (message.toLowerCase().includes("timeout")) {
    return "FFmpeg loading timed out. Make sure ffmpeg-core.js, ffmpeg-core.wasm, and ffmpeg-core.worker.js are uploaded in the same folder as index.html.";
  }
  return "FFmpeg failed to load: " + message;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + " timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getFFmpeg() {
  if (ffmpeg && ffmpeg.isLoaded()) return ffmpeg;
  if (ffmpegLoading) return ffmpegLoading;

  if (!window.FFmpeg || !window.FFmpeg.createFFmpeg || !window.FFmpeg.fetchFile) {
    throw new Error("ffmpeg.min.js is missing. Upload ffmpeg.min.js in the same folder as index.html.");
  }

  setStatus("Loading FFmpeg engine. First run can take up to 1 minute...", true);

  const { createFFmpeg } = window.FFmpeg;
  const ff = createFFmpeg({
    log: true,
    corePath: "./ffmpeg-core.js",
    progress: ({ ratio }) => {
      if (ratio > 0 && ratio <= 1) {
        setStatus(`Processing... ${Math.round(ratio * 100)}%`, true);
      }
    },
  });

  ff.setLogger(({ type, message }) => {
    if (type === "fferr" && message) console.warn(message);
  });

  ffmpegLoading = withTimeout(ff.load(), 90000, "FFmpeg load")
    .then(() => {
      ffmpeg = ff;
      ffmpegLoading = null;
      setStatus("FFmpeg ready. Processing started...", true);
      return ff;
    })
    .catch((error) => {
      ffmpegLoading = null;
      setStatus(failMessage(error));
      throw error;
    });

  return ffmpegLoading;
}

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function refreshButtons() {
  const has = files.length > 0;
  btnTrim.disabled = busy || !has;
  btnText.disabled = busy || !has;
  btnExport.disabled = busy || !has;
  btnMerge.disabled = busy || files.length < 2;
  playBtn.disabled = !has;
  muteBtn.disabled = !has;
  seek.disabled = !has;
}

function renderClips() {
  clipCount.textContent = files.length;
  clipsBox.classList.toggle("hidden", files.length === 0);
  clipList.innerHTML = "";

  files.forEach((file, i) => {
    const li = document.createElement("li");

    const name = document.createElement("button");
    name.className = "name" + (i === activeIdx ? " active" : "");
    name.textContent = `${i + 1}. ${file.name}`;
    name.onclick = () => {
      activeIdx = i;
      loadActive();
    };

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "✕";
    remove.onclick = () => {
      files.splice(i, 1);
      if (activeIdx >= files.length) activeIdx = Math.max(0, files.length - 1);
      loadActive();
    };

    li.append(name, remove);
    clipList.appendChild(li);
  });
}

function loadActive() {
  if (currentURL) URL.revokeObjectURL(currentURL);

  downloadLink.classList.add("hidden");
  downloadLink.removeAttribute("href");

  if (!files[activeIdx]) {
    placeholder.classList.remove("hidden");
    video.classList.add("hidden");
    video.removeAttribute("src");
    seek.value = 0;
    seek.max = 0;
    timeEl.textContent = "0:00 / 0:00";
  } else {
    currentURL = URL.createObjectURL(files[activeIdx]);
    video.src = currentURL;
    video.classList.remove("hidden");
    placeholder.classList.add("hidden");
    setStatus("");
  }

  renderClips();
  refreshButtons();
}

function addFiles(list) {
  const accepted = ["mp4", "mov", "m4v", "webm", "avi", "mkv"];
  const arr = Array.from(list || []).filter((file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    return file.type.startsWith("video/") || accepted.includes(ext);
  });

  if (!arr.length) {
    setStatus("Please choose a video file.");
    return;
  }

  files.push(...arr);
  loadActive();
}

fileInput.addEventListener("change", (e) => addFiles(e.target.files));
["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

video.addEventListener("loadedmetadata", () => {
  seek.max = video.duration || 0;
  timeEl.textContent = `${fmt(0)} / ${fmt(video.duration)}`;
  if (Number(video.duration) > 0) {
    trimTo.value = Math.min(5, Math.floor(video.duration * 10) / 10);
  }
});
video.addEventListener("timeupdate", () => {
  seek.value = video.currentTime;
  timeEl.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
});
video.addEventListener("play", () => (playBtn.textContent = "⏸"));
video.addEventListener("pause", () => (playBtn.textContent = "▶"));
playBtn.onclick = () => (video.paused ? video.play() : video.pause());
seek.oninput = () => {
  video.currentTime = parseFloat(seek.value) || 0;
};
muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
};

function safeInputName(file, fallback) {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${fallback}.${ext || "mp4"}`;
}

function offerDownload(data, name) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const blob = new Blob([bytes], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  downloadLink.href = url;
  downloadLink.download = name;
  downloadLink.textContent = `Download ${name}`;
  downloadLink.classList.remove("hidden");

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function cleanup(ff, names) {
  for (const name of names) {
    try { ff.FS("unlink", name); } catch (_) {}
  }
}

async function withBusy(fn) {
  busy = true;
  refreshButtons();
  try {
    await fn();
  } catch (error) {
    console.error(error);
    setStatus(failMessage(error));
  } finally {
    busy = false;
    refreshButtons();
  }
}

btnTrim.onclick = () => withBusy(async () => {
  const file = files[activeIdx];
  const from = parseFloat(trimFrom.value) || 0;
  const to = parseFloat(trimTo.value) || 0;

  if (!file) return;
  if (to <= from) {
    setStatus("Trim 'To' must be greater than 'From'.");
    return;
  }

  const ff = await getFFmpeg();
  const { fetchFile } = window.FFmpeg;
  const input = safeInputName(file, "trim-input");
  const output = "trimmed-output.mp4";

  setStatus("Trimming video...", true);
  await cleanup(ff, [input, output]);
  ff.FS("writeFile", input, await fetchFile(file));
  await ff.run("-ss", String(from), "-to", String(to), "-i", input, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", output);
  const out = ff.FS("readFile", output);
  offerDownload(out, "trimmed.mp4");
  setStatus("Trim complete. Download started.");
  await cleanup(ff, [input, output]);
});

btnMerge.onclick = () => withBusy(async () => {
  if (files.length < 2) {
    setStatus("Add at least 2 videos.");
    return;
  }

  const ff = await getFFmpeg();
  const { fetchFile } = window.FFmpeg;
  const written = [];
  const normalized = [];

  setStatus("Merging videos...", true);

  for (let i = 0; i < files.length; i++) {
    const input = safeInputName(files[i], `merge-input-${i}`);
    const part = `merge-part-${i}.ts`;
    written.push(input, part);
    normalized.push(part);
    ff.FS("writeFile", input, await fetchFile(files[i]));
    await ff.run(
      "-i", input,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-b:a", "128k",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-r", "30",
      "-bsf:v", "h264_mp4toannexb",
      "-f", "mpegts",
      part,
    );
  }

  const output = "merged-output.mp4";
  written.push(output);
  await ff.run("-i", `concat:${normalized.join("|")}`, "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", output);
  const out = ff.FS("readFile", output);
  offerDownload(out, "merged.mp4");
  setStatus("Merge complete. Download started.");
  await cleanup(ff, written);
});

btnText.onclick = () => withBusy(async () => {
  const file = files[activeIdx];
  const txt = textValue.value.trim();
  const from = parseFloat(textFrom.value) || 0;
  const to = parseFloat(textTo.value) || 0;

  if (!file) return;
  if (!txt) {
    setStatus("Enter overlay text.");
    return;
  }
  if (to <= from) {
    setStatus("Text 'To' must be greater than 'From'.");
    return;
  }

  const ff = await getFFmpeg();
  const { fetchFile } = window.FFmpeg;
  const input = safeInputName(file, "text-input");
  const output = "text-output.mp4";
  const safe = txt.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const filter = `drawtext=text='${safe}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-40:enable='between(t,${from},${to})'`;

  setStatus("Rendering text overlay...", true);
  await cleanup(ff, [input, output]);
  ff.FS("writeFile", input, await fetchFile(file));
  await ff.run("-i", input, "-vf", filter, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", output);
  const out = ff.FS("readFile", output);
  offerDownload(out, "text-overlay.mp4");
  setStatus("Text overlay complete. Download started.");
  await cleanup(ff, [input, output]);
});

btnExport.onclick = () => withBusy(async () => {
  const file = files[activeIdx];
  if (!file) return;

  const ff = await getFFmpeg();
  const { fetchFile } = window.FFmpeg;
  const input = safeInputName(file, "export-input");
  const output = "export-output.mp4";

  setStatus("Exporting MP4...", true);
  await cleanup(ff, [input, output]);
  ff.FS("writeFile", input, await fetchFile(file));
  await ff.run("-i", input, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", output);
  const out = ff.FS("readFile", output);
  offerDownload(out, "export.mp4");
  setStatus("Export complete. Download started.");
  await cleanup(ff, [input, output]);
});

refreshButtons();
