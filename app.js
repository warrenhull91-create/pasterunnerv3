const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYKopfIXlyWsICDxeg5kV4GM3JQ8g-e7rHp0Kzt8Mzzj1mbmktBlv2FOf7gBEfSwwwOQ/exec";

function val(id){ return document.getElementById(id)?.value?.trim() || ""; }

/* ============================================================
   CHECKLIST DEFINITION
   Shared by the form template, the cycle-button logic and the
   PDF card builder so the item list only lives in one place.
   ============================================================ */
const CHECKLIST_ITEMS = [
  { key: "containment_zone", label: "Containment Zone" },
  { key: "exclusion_zone",   label: "Exclusion Zone" },
  { key: "cameras",          label: "Cameras" },
  { key: "knifegate",        label: "Knifegate" },
  { key: "signage",          label: "Signage" },
  { key: "wall_status",      label: "Wall Status" },
  { key: "bund_status",      label: "Bund Status" },
  { key: "changeover_points",label: "Changeover Points" }
];

const CHECKLIST_CYCLE = ["", "OK", "Requires Attention", "N/A"];

function checklistCycleMeta(state){
  switch(state){
    case "OK": return { icon: "✅", label: "OK", cls: "cycle-ok" };
    case "Requires Attention": return { icon: "❌", label: "Requires Attention", cls: "cycle-issue" };
    case "N/A": return { icon: "N/A", label: "N/A", cls: "cycle-na" };
    default: return { icon: "○", label: "Not Checked", cls: "cycle-none" };
  }
}

/* ============================================================
   DYNAMIC STOPE STATE
   sid = a permanent, never-reused unique id assigned to a card
   when it's created. It is only used to build unique DOM ids
   and to key the in-memory photo store — display numbering
   ("Stope 1/2/3...") is computed separately from DOM position,
   so cards can be added/removed/renumbered freely.
   ============================================================ */
let stopeUidCounter = 0;
let photoUidCounter = 0;
const stopePhotos = {}; // key: `${sid}::${field}` -> [{ id, dataUrl }]

function photoKey(sid, field){ return `${sid}::${field}`; }

/* ---------------- FORM CARD TEMPLATE ---------------- */

function stopeCardTemplate(sid){
  const checklistRows = CHECKLIST_ITEMS.map(({ key, label }) => `
          <div class="checklist-row" data-checklist-row="${key}">
            <div class="checklist-label">${label}</div>
            <button type="button" class="checklist-cycle-btn cycle-none" data-field="${key}">○ Not Checked</button>
            <input type="hidden" id="stope_${sid}_${key}" data-field="${key}" value="">
            <div class="issue-details-wrap">
              <label>Issue Details
                <textarea id="stope_${sid}_${key}_issue" data-field="${key}_issue" placeholder="Describe the issue..."></textarea>
              </label>
              <div class="photo-section" data-photo-section="${key}">
                <button type="button" class="btn ghost photo-add-btn" data-photo-add="${key}">+ Add Photo</button>
                <input type="file" accept="image/*" capture="environment" multiple class="photo-file-input" data-photo-input="${key}" style="display:none;">
                <div class="photo-thumb-grid" data-photo-grid="${key}"></div>
              </div>
            </div>
          </div>`).join("");

  return `
        <div class="stope-card" data-sid="${sid}">
          <div class="stope-card-header">
            <h3>Stope</h3>
            <button type="button" class="remove-stope-btn">Remove Stope</button>
          </div>

          <div class="status-group-label">Stope Status</div>
          <div class="status-btn-group" role="group">
            <button type="button" class="status-btn" data-value="Pouring">
              <span class="status-dot dot-pouring"></span>POURING
            </button>
            <button type="button" class="status-btn" data-value="Stope Full">
              <span class="status-dot dot-full"></span>STOPE FULL
            </button>
            <button type="button" class="status-btn" data-value="Plug Curing">
              <span class="status-dot dot-curing"></span>PLUG CURING
            </button>
            <button type="button" class="status-btn" data-value="Other">
              <span class="status-dot dot-other"></span>OTHER
            </button>
          </div>
          <input type="hidden" id="stope_${sid}_status" data-field="status" value="">

          <div class="other-status-wrap" data-other-wrap>
            <label>Other Status Details
              <textarea id="stope_${sid}_other_details" data-field="other_details" placeholder="Describe the status..."></textarea>
            </label>
          </div>

          <div class="stope-metrics-grid">
            <label>Level of Fill Point <input id="stope_${sid}_fill_point" data-field="fill_point" type="text" placeholder="e.g. 2.5m"></label>
            <label>Total m³ <input id="stope_${sid}_total_m3" data-field="total_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Plug m³ <input id="stope_${sid}_plug_m3" data-field="plug_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Poured m³ <input id="stope_${sid}_poured_m3" data-field="poured_m3" type="number" step="0.1" placeholder="0.0"></label>
          </div>

          <div class="checklist-divider">Times</div>
          <div class="stope-times-grid">
            <label>Start Time <input id="stope_${sid}_time_start" data-field="time_start" type="time"></label>
            <label>Plug Started <input id="stope_${sid}_time_plug_started" data-field="time_plug_started" type="time"></label>
            <label>Plug Finished <input id="stope_${sid}_time_plug_finished" data-field="time_plug_finished" type="time"></label>
            <label>Pour Started <input id="stope_${sid}_time_pour_started" data-field="time_pour_started" type="time"></label>
            <label>Pour Finished <input id="stope_${sid}_time_pour_finished" data-field="time_pour_finished" type="time"></label>
            <label>Flush Started <input id="stope_${sid}_time_flush_started" data-field="time_flush_started" type="time"></label>
            <label>Flush Finished <input id="stope_${sid}_time_flush_finished" data-field="time_flush_finished" type="time"></label>
          </div>

          <div class="checklist-divider">Stope Checklist</div>
          <div class="checklist">
${checklistRows}
          </div>

          <label class="stope-comments">Delays <textarea id="stope_${sid}_delays" data-field="delays" placeholder="Note any delays..."></textarea></label>
          <label class="stope-comments">General Notes <textarea id="stope_${sid}_general_notes" data-field="general_notes" placeholder="General notes..."></textarea></label>
        </div>`;
}

/* ---------------- ADD / REMOVE / RENUMBER ---------------- */

function addStope(){
  stopeUidCounter += 1;
  const sid = stopeUidCounter;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = stopeCardTemplate(sid).trim();
  const card = wrapper.firstElementChild;
  document.getElementById("stopesContainer").appendChild(card);
  renumberStopes();
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function removeStope(card){
  const sid = card.dataset.sid;
  Object.keys(stopePhotos).forEach(key => {
    if(key.startsWith(sid + "::")) delete stopePhotos[key];
  });
  card.remove();
  renumberStopes();
}

function renumberStopes(){
  const cards = document.querySelectorAll("#stopesContainer .stope-card");
  cards.forEach((card, idx) => {
    const n = idx + 1;
    card.dataset.displayNumber = n;

    const header = card.querySelector(".stope-card-header h3");
    if(header) header.textContent = `Stope ${n}`;

    const statusGroup = card.querySelector(".status-btn-group");
    if(statusGroup) statusGroup.setAttribute("aria-label", `Stope ${n} status`);

    // Stope in position 1 can never be removed, regardless of which
    // physical card currently occupies that slot.
    const removeBtn = card.querySelector(".remove-stope-btn");
    if(removeBtn) removeBtn.style.display = (idx === 0) ? "none" : "";
  });
}

/* ---------------- PHOTO CAPTURE + COMPRESSION ---------------- */

function compressImageFile(file, maxDim = 1000, quality = 0.6){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read selected image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

function renderPhotoThumbs(card, field){
  const sid = card.dataset.sid;
  const grid = card.querySelector(`[data-photo-grid="${field}"]`);
  if(!grid) return;
  const photos = stopePhotos[photoKey(sid, field)] || [];
  grid.innerHTML = photos.map(p => `
        <div class="photo-thumb" data-photo-id="${p.id}">
          <img src="${p.dataUrl}" alt="Issue photo">
          <button type="button" class="photo-delete-btn" data-photo-delete="${p.id}" aria-label="Delete photo">&times;</button>
        </div>`).join("");
}

async function handlePhotoFiles(card, field, files){
  const sid = card.dataset.sid;
  const key = photoKey(sid, field);
  if(!stopePhotos[key]) stopePhotos[key] = [];
  for(const file of Array.from(files)){
    try{
      const dataUrl = await compressImageFile(file);
      photoUidCounter += 1;
      stopePhotos[key].push({ id: photoUidCounter, dataUrl });
    } catch(err){
      console.error("Photo compression failed:", err);
    }
  }
  renderPhotoThumbs(card, field);
}

function deletePhoto(card, field, photoId){
  const sid = card.dataset.sid;
  const key = photoKey(sid, field);
  stopePhotos[key] = (stopePhotos[key] || []).filter(p => String(p.id) !== String(photoId));
  renderPhotoThumbs(card, field);
}

/* ---------------- STOPE CONTAINER EVENT DELEGATION ---------------- */
/* One set of listeners on the container handles every card, present
   or future, so add/remove never needs to re-bind anything. */

function handleStatusButtonClick(btn){
  const card = btn.closest(".stope-card");
  const value = btn.dataset.value;
  const hidden = card.querySelector('[data-field="status"]');
  if(hidden) hidden.value = value;

  card.querySelectorAll(".status-btn").forEach(b => {
    b.classList.toggle("active", b === btn);
  });

  const otherWrap = card.querySelector("[data-other-wrap]");
  if(otherWrap) otherWrap.classList.toggle("show", value === "Other");
}

function handleChecklistCycleClick(btn){
  const card = btn.closest(".stope-card");
  const field = btn.dataset.field;
  const hidden = card.querySelector(`[data-field="${field}"]`);
  if(!hidden) return;

  const currentIdx = CHECKLIST_CYCLE.indexOf(hidden.value);
  const next = CHECKLIST_CYCLE[(currentIdx + 1) % CHECKLIST_CYCLE.length];
  hidden.value = next;

  const meta = checklistCycleMeta(next);
  btn.textContent = `${meta.icon} ${meta.label}`;
  btn.className = "checklist-cycle-btn " + meta.cls;

  const row = btn.closest(".checklist-row");
  const issueWrap = row ? row.querySelector(".issue-details-wrap") : null;
  const isIssue = next === "Requires Attention";
  if(row) row.classList.toggle("issue-active", isIssue);
  if(issueWrap) issueWrap.classList.toggle("show", isIssue);
}

function initStopesContainerEvents(){
  const container = document.getElementById("stopesContainer");

  container.addEventListener("click", (e) => {
    const statusBtn = e.target.closest(".status-btn");
    if(statusBtn){ handleStatusButtonClick(statusBtn); return; }

    const cycleBtn = e.target.closest(".checklist-cycle-btn");
    if(cycleBtn){ handleChecklistCycleClick(cycleBtn); return; }

    const removeBtn = e.target.closest(".remove-stope-btn");
    if(removeBtn){
      const card = removeBtn.closest(".stope-card");
      const cards = container.querySelectorAll(".stope-card");
      if(cards.length <= 1) return; // always keep at least one stope
      if(Array.from(cards).indexOf(card) === 0) return; // Stope 1 can't be removed
      if(confirm("Remove this stope and all its data?")){
        removeStope(card);
      }
      return;
    }

    const photoAddBtn = e.target.closest(".photo-add-btn");
    if(photoAddBtn){
      const field = photoAddBtn.dataset.photoAdd;
      const card = photoAddBtn.closest(".stope-card");
      const input = card.querySelector(`[data-photo-input="${field}"]`);
      if(input) input.click();
      return;
    }

    const deleteBtn = e.target.closest(".photo-delete-btn");
    if(deleteBtn){
      const section = deleteBtn.closest("[data-photo-section]");
      const card = deleteBtn.closest(".stope-card");
      if(section && card){
        deletePhoto(card, section.dataset.photoSection, deleteBtn.dataset.photoDelete);
      }
      return;
    }
  });

  container.addEventListener("change", (e) => {
    if(e.target.matches(".photo-file-input")){
      const field = e.target.dataset.photoInput;
      const card = e.target.closest(".stope-card");
      if(e.target.files && e.target.files.length){
        handlePhotoFiles(card, field, e.target.files);
      }
      e.target.value = "";
    }
  });
}

/* ============================================================
   REPORT COLLECTION
   Shift-level fields are read exactly as before (same IDs).
   Stope fields are now read dynamically from however many
   .stope-card elements currently exist, in DOM order — that
   order IS the display order ("Stope 1, 2, 3...").
   ============================================================ */

function collectReport(isTest=false){
  const today = new Date().toISOString().slice(0,10);

  const stopes = Array.from(document.querySelectorAll("#stopesContainer .stope-card")).map((card, idx) => {
    const getVal = (field) => {
      const el = card.querySelector(`[data-field="${field}"]`);
      return (el && el.value ? el.value : "").trim();
    };
    const sid = card.dataset.sid;

    const stope = {
      stope_number: idx + 1,
      status: getVal("status"),
      other_details: getVal("other_details"),
      fill_point: getVal("fill_point"),
      total_m3: getVal("total_m3"),
      plug_m3: getVal("plug_m3"),
      poured_m3: getVal("poured_m3"),
      time_start: getVal("time_start"),
      time_plug_started: getVal("time_plug_started"),
      time_plug_finished: getVal("time_plug_finished"),
      time_pour_started: getVal("time_pour_started"),
      time_pour_finished: getVal("time_pour_finished"),
      time_flush_started: getVal("time_flush_started"),
      time_flush_finished: getVal("time_flush_finished"),
      delays: getVal("delays"),
      general_notes: getVal("general_notes")
    };

    CHECKLIST_ITEMS.forEach(({ key }) => {
      stope[key] = getVal(key);
      stope[`${key}_issue`] = getVal(`${key}_issue`);
      stope[`${key}_photos`] = (stopePhotos[photoKey(sid, key)] || []).map(p => p.dataUrl);
    });

    return stope;
  });

  return {
    isTest,
    shift_date: val("shift_date") || today,
    shift_type: val("shift_type") || "D/S",
    operator: val("operator") || (isTest ? "Test User" : ""),
    shift_boss: val("shift_boss"),
    plant_operator: val("plant_operator"),
    paste_runner: val("paste_runner"),
    started_pouring: val("started_pouring"),
    finished_pouring: val("finished_pouring"),
    comments: val("comments") || (isTest ? "Test submission from Paste Runner V3." : ""),
    stopes
  };
}

function setStatus(type, msg){
  const el = document.getElementById("status");
  el.className = "status show " + type;
  el.textContent = msg;
}

/* ============================================================
   PDF TEMPLATE POPULATION
   The PDF's Stopes section is rebuilt from scratch on every
   submit — one card per current stope, in the same order shown
   on screen — so it always matches however many stopes exist.
   ============================================================ */

const PDF_STATUS_META = {
  "OK": "pill-ok",
  "Pouring": "pill-ok",
  "Requires Attention": "pill-warn",
  "Stope Full": "pill-warn",
  "Plug Curing": "pill-curing",
  "N/A": "pill-na",
  "Other": "pill-na"
};

function escapeHtml(str){
  return String(str === undefined || str === null ? "" : str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function pdfTextOrDash(value){
  const str = (value === undefined || value === null) ? "" : String(value).trim();
  return str ? escapeHtml(str) : "—";
}

function pdfPillHTML(value, emptyLabel){
  const str = (value === undefined || value === null) ? "" : String(value).trim();
  const cls = str ? (PDF_STATUS_META[str] || "pill-na") : "pill-na";
  const text = str || (emptyLabel || "Not Set");
  return `<span class="pdf-pill ${cls}">${escapeHtml(text)}</span>`;
}

function pdfSetText(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  const str = (value === undefined || value === null || String(value).trim() === "") ? "" : String(value);
  el.textContent = str || "—";
}

function buildPdfStopeCardHTML(stope, n){
  const checklistRows = CHECKLIST_ITEMS.map(({ key, label }) => {
    const photos = stope[`${key}_photos`] || [];
    const photosHTML = photos.length
      ? `<div class="pdf-photo-grid">${photos.map(src => `<img class="pdf-photo-thumb" src="${src}" alt="Issue photo">`).join("")}</div>`
      : "";
    return `
            <tr>
              <td class="label">${escapeHtml(label)}</td>
              <td>${pdfPillHTML(stope[key], "Not Checked")}</td>
              <td>${pdfTextOrDash(stope[`${key}_issue`])}${photosHTML}</td>
            </tr>`;
  }).join("");

  return `
        <div class="pdf-stope-card">
          <div class="pdf-stope-head">
            <h3>Stope ${n}</h3>
          </div>

          <div class="pdf-status-row">
            <div>
              <span>Stope Status</span>
              ${pdfPillHTML(stope.status, "Not Set")}
            </div>
            <div class="pdf-status-other">
              <span>Other Status Details</span>
              <span>${pdfTextOrDash(stope.other_details)}</span>
            </div>
          </div>

          <table class="pdf-table pdf-metrics-table">
            <tr>
              <td class="label">Level of Fill Point</td><td>${pdfTextOrDash(stope.fill_point)}</td>
              <td class="label">Total m³</td><td>${pdfTextOrDash(stope.total_m3)}</td>
            </tr>
            <tr>
              <td class="label">Plug m³</td><td>${pdfTextOrDash(stope.plug_m3)}</td>
              <td class="label">Poured m³</td><td>${pdfTextOrDash(stope.poured_m3)}</td>
            </tr>
          </table>

          <div class="pdf-checklist-title">Times</div>
          <table class="pdf-table pdf-metrics-table">
            <tr>
              <td class="label">Start Time</td><td>${pdfTextOrDash(stope.time_start)}</td>
              <td class="label">Plug Started</td><td>${pdfTextOrDash(stope.time_plug_started)}</td>
            </tr>
            <tr>
              <td class="label">Plug Finished</td><td>${pdfTextOrDash(stope.time_plug_finished)}</td>
              <td class="label">Pour Started</td><td>${pdfTextOrDash(stope.time_pour_started)}</td>
            </tr>
            <tr>
              <td class="label">Pour Finished</td><td>${pdfTextOrDash(stope.time_pour_finished)}</td>
              <td class="label">Flush Started</td><td>${pdfTextOrDash(stope.time_flush_started)}</td>
            </tr>
            <tr>
              <td class="label">Flush Finished</td><td>${pdfTextOrDash(stope.time_flush_finished)}</td>
              <td class="label"></td><td></td>
            </tr>
          </table>

          <div class="pdf-checklist-title">Stope Checklist</div>
          <table class="pdf-table pdf-checklist-table">
            <tr>
              <td class="label">Item</td><td class="label">Status</td><td class="label">Issue Details / Photos</td>
            </tr>${checklistRows}
          </table>

          <div class="pdf-comments-inline">
            <span class="pdf-comments-label">Delays</span>
            <span>${pdfTextOrDash(stope.delays)}</span>
          </div>
          <div class="pdf-comments-inline">
            <span class="pdf-comments-label">General Notes</span>
            <span>${pdfTextOrDash(stope.general_notes)}</span>
          </div>
        </div>`;
}

function waitForImages(container){
  const imgs = Array.from(container.querySelectorAll("img"));
  if(imgs.length === 0) return Promise.resolve();
  return Promise.all(imgs.map(img => {
    if(img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

async function populatePdfTemplate(report){
  pdfSetText("pdf_shift_date", report.shift_date);
  pdfSetText("pdf_shift_type", report.shift_type);
  pdfSetText("pdf_operator", report.operator);
  pdfSetText("pdf_shift_boss", report.shift_boss);
  pdfSetText("pdf_plant_operator", report.plant_operator);
  pdfSetText("pdf_paste_runner", report.paste_runner);
  pdfSetText("pdf_started_pouring", report.started_pouring);
  pdfSetText("pdf_finished_pouring", report.finished_pouring);
  pdfSetText("pdf_comments", report.comments);
  pdfSetText("pdf_generated_at", new Date().toLocaleString());

  const container = document.getElementById("pdfStopesContainer");
  container.innerHTML = (report.stopes || [])
    .map((stope, idx) => buildPdfStopeCardHTML(stope, idx + 1))
    .join("");

  // Photos are embedded as <img src="data:..."> — make sure they've
  // actually decoded before html2canvas captures the page, or the
  // PDF can come out with blank image boxes.
  await waitForImages(container);
}

/* ============================================================
   PDF GENERATION (html2canvas + jsPDF)
   ============================================================ */

async function buildPdfBlob(){
  const template = document.getElementById("pdfTemplate");
  if(!template){
    throw new Error("PDF template not found in page.");
  }

  const canvas = await html2canvas(template, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: template.scrollWidth,
    windowHeight: template.scrollHeight
  });

  if(!canvas || canvas.width === 0 || canvas.height === 0){
    throw new Error("PDF capture produced an empty canvas.");
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while(heightLeft > 0){
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}

function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Failed to read generated PDF."));
    reader.readAsDataURL(blob);
  });
}

/* ============================================================
   SUBMIT FLOW
   Same fetch target and payload shape as before — only the PDF
   template population step now awaits image loading.
   ============================================================ */

async function submitReport(isTest=false){
  try{
    setStatus("busy", isTest ? "Sending test..." : "Submitting shift sheet...");
    const report = collectReport(isTest);

    await populatePdfTemplate(report);
    // let the browser paint the populated template before capture
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    setStatus("busy", "Generating PDF...");
    const pdfBlob = await buildPdfBlob();
    if(!pdfBlob || pdfBlob.size === 0){
      throw new Error("Generated PDF was empty.");
    }
    const pdfBase64 = await blobToBase64(pdfBlob);

    setStatus("busy", isTest ? "Sending test..." : "Submitting shift sheet...");

    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ report, pdf_base64: pdfBase64 })
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { success:false, error:text }; }

    if(!data.success){
      throw new Error(data.error || "Submission failed");
    }

    setStatus("good", "Submitted successfully. PDF created in Google Drive and email sent.");
    console.log("Drive PDF:", data.url);
  } catch(err){
    setStatus("bad", "Failed: " + err.message);
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("shift_date").value = new Date().toISOString().slice(0,10);
  document.getElementById("submitBtn").addEventListener("click", () => submitReport(false));
  document.getElementById("testBtn").addEventListener("click", () => submitReport(true));
  document.getElementById("addStopeBtn").addEventListener("click", () => addStope());

  initStopesContainerEvents();
  addStope(); // seed the form with exactly one stope card (Stope 1)
});
