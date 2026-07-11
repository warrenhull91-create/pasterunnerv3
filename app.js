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
            <h3 data-stope-heading>NEW STOPE</h3>
            <button type="button" class="remove-stope-btn">Remove Stope</button>
          </div>

          <label class="stope-name-field">Stope Name
            <input id="stope_${sid}_name" data-field="stope_name" type="text" placeholder="e.g. 1205 North">
          </label>

          <div class="status-group-label">Stope Type</div>
          <div class="status-btn-group two-col" role="group">
            <button type="button" class="status-btn" data-value="Plug">
              <span class="status-dot dot-curing"></span>PLUG
            </button>
            <button type="button" class="status-btn" data-value="Body">
              <span class="status-dot dot-pouring"></span>BODY
            </button>
          </div>
          <input type="hidden" id="stope_${sid}_status" data-field="status" value="">

          <div class="status-group-label">Hot Seating</div>
          <div class="status-btn-group three-col" role="group">
            <button type="button" class="hotseat-btn" data-value="AM">AM</button>
            <button type="button" class="hotseat-btn" data-value="PM">PM</button>
            <button type="button" class="hotseat-btn" data-value="Both">BOTH</button>
          </div>
          <input type="hidden" id="stope_${sid}_hot_seating" data-field="hot_seating" value="">

          <div class="stope-metrics-grid">
            <label>Level of Fill Point <input id="stope_${sid}_fill_point" data-field="fill_point" type="text" placeholder="e.g. 2.5m"></label>
            <label>Total m³ <input id="stope_${sid}_total_m3" data-field="total_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Plug m³ <input id="stope_${sid}_plug_m3" data-field="plug_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Poured m³ <input id="stope_${sid}_poured_m3" data-field="poured_m3" type="number" step="0.1" placeholder="0.0"></label>
          </div>

          <div class="checklist-divider">Times</div>
          <div class="stope-times-grid">
            <label>Start Time <input id="stope_${sid}_time_start" data-field="time_start" type="time"></label>
            <label>Pour Finished <input id="stope_${sid}_time_pour_finished" data-field="time_pour_finished" type="time"></label>
            <label>Flush Finished <input id="stope_${sid}_time_flush_finished" data-field="time_flush_finished" type="time"></label>
          </div>

          <div class="checklist-divider">Time of Flush</div>
          <div class="flush-times-list" data-flush-list></div>
          <button type="button" class="btn ghost add-flush-btn" data-add-flush>+ Add Another Flush</button>

          <div class="checklist-divider">Stope Checklist</div>
          <div class="checklist">
${checklistRows}
          </div>

          <label class="stope-comments">Delays <textarea id="stope_${sid}_delays" data-field="delays" placeholder="Note any delays..."></textarea></label>
          <label class="stope-comments">General Notes <textarea id="stope_${sid}_general_notes" data-field="general_notes" placeholder="General notes..."></textarea></label>
        </div>`;
}

function flushRowTemplate(sid, fid, n){
  return `
        <div class="flush-time-row" data-flush-row="${fid}">
          <label class="flush-time-label">
            <span data-flush-label-text>Time of Flush ${n}</span>
            <input type="time" id="stope_${sid}_flush_${fid}" data-field="flush_time" data-flush-id="${fid}">
          </label>
          <button type="button" class="remove-flush-btn" data-flush-id="${fid}">Remove</button>
        </div>`;
}

/* ---------------- ADD / REMOVE ---------------- */

function addStope(){
  stopeUidCounter += 1;
  const sid = stopeUidCounter;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = stopeCardTemplate(sid).trim();
  const card = wrapper.firstElementChild;
  document.getElementById("stopesContainer").appendChild(card);
  addFlushRow(card); // every stope starts with exactly one Time of Flush row
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function removeStope(card){
  const sid = card.dataset.sid;
  Object.keys(stopePhotos).forEach(key => {
    if(key.startsWith(sid + "::")) delete stopePhotos[key];
  });
  card.remove();
}

function updateStopeHeading(card){
  const nameField = card.querySelector('[data-field="stope_name"]');
  const heading = card.querySelector("[data-stope-heading]");
  if(!heading) return;
  const name = (nameField && nameField.value ? nameField.value : "").trim();
  heading.textContent = name ? `STOPE — ${name.toUpperCase()}` : "NEW STOPE";
}

/* ---------------- TIME OF FLUSH (repeatable per stope) ---------------- */

let flushUidCounter = 0;

function addFlushRow(card){
  flushUidCounter += 1;
  const fid = flushUidCounter;
  const sid = card.dataset.sid;
  const list = card.querySelector("[data-flush-list]");
  const n = list.querySelectorAll(".flush-time-row").length + 1;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = flushRowTemplate(sid, fid, n).trim();
  list.appendChild(wrapper.firstElementChild);
  renumberFlushRows(card);
}

function removeFlushRow(card, row){
  row.remove();
  renumberFlushRows(card);
}

function renumberFlushRows(card){
  const rows = card.querySelectorAll(".flush-time-row");
  rows.forEach((row, idx) => {
    const labelText = row.querySelector("[data-flush-label-text]");
    if(labelText) labelText.textContent = `Time of Flush ${idx + 1}`;
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
}

function handleHotSeatingClick(btn){
  const card = btn.closest(".stope-card");
  const value = btn.dataset.value;
  const hidden = card.querySelector('[data-field="hot_seating"]');
  if(hidden) hidden.value = value;

  card.querySelectorAll(".hotseat-btn").forEach(b => {
    b.classList.toggle("active", b === btn);
  });
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
    const hotseatBtn = e.target.closest(".hotseat-btn");
    if(hotseatBtn){ handleHotSeatingClick(hotseatBtn); return; }

    const statusBtn = e.target.closest(".status-btn");
    if(statusBtn){ handleStatusButtonClick(statusBtn); return; }

    const cycleBtn = e.target.closest(".checklist-cycle-btn");
    if(cycleBtn){ handleChecklistCycleClick(cycleBtn); return; }

    const addFlushBtn = e.target.closest(".add-flush-btn");
    if(addFlushBtn){
      const card = addFlushBtn.closest(".stope-card");
      addFlushRow(card);
      return;
    }

    const removeFlushBtn = e.target.closest(".remove-flush-btn");
    if(removeFlushBtn){
      const card = removeFlushBtn.closest(".stope-card");
      const row = removeFlushBtn.closest(".flush-time-row");
      const rows = card.querySelectorAll(".flush-time-row");
      if(rows.length <= 1) return; // keep at least one Time of Flush row
      removeFlushRow(card, row);
      return;
    }

    const removeBtn = e.target.closest(".remove-stope-btn");
    if(removeBtn){
      const card = removeBtn.closest(".stope-card");
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

  container.addEventListener("input", (e) => {
    if(e.target.matches('[data-field="stope_name"]')){
      updateStopeHeading(e.target.closest(".stope-card"));
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
   LEVEL CHECKS — Level Cards + Inspection Entries
   Starts with 6 Level Cards, each holding 5 inspection entries.
   Both are extensible: "+ Add Another Level" appends cards,
   "+ Add Inspection" (inside each card) appends entries. Cards
   and non-default entries are removable; default entries can
   only be cleared, never removed, since every card always keeps
   its 5 starting slots.
   ============================================================ */

let levelUidCounter = 0;
let entryUidCounter = 0;

function formatTimestampNow(){
  const now = new Date();
  const datePart = now.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
  const timePart = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart}, ${timePart}`;
}

function inspectionEntryTemplate(lid, eid, isDefault){
  return `
        <div class="inspection-entry" data-eid="${eid}" data-default="${isDefault ? "true" : "false"}">
          <div class="inspection-entry-header">
            <span class="inspection-entry-title">Inspection Entry</span>
            <div class="inspection-entry-actions">
              <button type="button" class="clear-entry-btn" data-clear-entry>Clear</button>
              ${isDefault ? "" : `<button type="button" class="remove-entry-btn" data-remove-entry>Remove</button>`}
            </div>
          </div>

          <label>Level Reading <input type="text" id="level_${lid}_entry_${eid}_reading" data-field="reading" placeholder="e.g. 14.2m"></label>

          <div class="inspection-status-group" role="group">
            <button type="button" class="inspection-status-btn inspection-inspected" data-value="Inspected">✅ INSPECTED</button>
            <button type="button" class="inspection-status-btn inspection-cant" data-value="Cant Access">🚫 CAN'T ACCESS</button>
          </div>
          <input type="hidden" id="level_${lid}_entry_${eid}_status" data-field="status" value="">

          <div class="inspection-comments-wrap" data-comments-wrap>
            <label>Comments
              <textarea id="level_${lid}_entry_${eid}_comments" data-field="comments" placeholder="Explain why this reading couldn't be accessed..."></textarea>
            </label>
          </div>

          <label class="inspection-timestamp-field">Recorded
            <input type="text" id="level_${lid}_entry_${eid}_timestamp" data-field="timestamp" readonly placeholder="Not yet recorded">
          </label>
        </div>`;
}

function buildDefaultEntriesHTML(lid, count){
  let html = "";
  for(let i = 0; i < count; i++){
    entryUidCounter += 1;
    html += inspectionEntryTemplate(lid, entryUidCounter, true);
  }
  return html;
}

function levelCardTemplate(lid){
  return `
        <div class="level-card" data-lid="${lid}">
          <div class="level-card-header">
            <button type="button" class="collapse-toggle-btn" data-collapse-toggle aria-label="Collapse card">▾</button>
            <input type="text" class="level-name-input" id="level_${lid}_name" data-field="level_name" placeholder="e.g. 1450 Level">
            <span class="level-progress" data-level-progress>0 / 5 Completed</span>
            <button type="button" class="remove-stope-btn remove-level-btn">Remove Level</button>
          </div>
          <div class="level-card-body" data-card-body>
            <div class="inspection-list" data-inspection-list>
${buildDefaultEntriesHTML(lid, 5)}
            </div>
            <button type="button" class="btn ghost add-inspection-btn" data-add-inspection>+ Add Inspection</button>
          </div>
        </div>`;
}

function addLevelCard(scrollTo = true){
  levelUidCounter += 1;
  const lid = levelUidCounter;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = levelCardTemplate(lid).trim();
  const card = wrapper.firstElementChild;
  document.getElementById("levelsContainer").appendChild(card);
  updateCardProgress(card);
  if(scrollTo){
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function removeLevelCard(card){
  card.remove();
}

function addInspectionEntry(card){
  const lid = card.dataset.lid;
  entryUidCounter += 1;
  const eid = entryUidCounter;
  const list = card.querySelector("[data-inspection-list]");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = inspectionEntryTemplate(lid, eid, false).trim();
  list.appendChild(wrapper.firstElementChild);
  updateCardProgress(card);
}

function removeInspectionEntry(card, entry){
  entry.remove();
  updateCardProgress(card);
}

function clearInspectionEntry(entry){
  entry.querySelectorAll("[data-field]").forEach(el => { el.value = ""; });
  entry.querySelectorAll(".inspection-status-btn").forEach(b => b.classList.remove("active"));
  const commentsWrap = entry.querySelector("[data-comments-wrap]");
  if(commentsWrap) commentsWrap.classList.remove("show");
  const card = entry.closest(".level-card");
  if(card) updateCardProgress(card);
}

function refreshEntryTimestamp(entry){
  const reading = (entry.querySelector('[data-field="reading"]')?.value || "").trim();
  const status = (entry.querySelector('[data-field="status"]')?.value || "").trim();
  const comments = (entry.querySelector('[data-field="comments"]')?.value || "").trim();
  const tsField = entry.querySelector('[data-field="timestamp"]');
  if(!tsField) return;

  const isEmpty = !reading && !status && !comments;
  // Every qualifying edit re-stamps to now — including edits to an entry
  // that was already timestamped — so the record always reflects the
  // most recent change, per spec.
  tsField.value = isEmpty ? "" : formatTimestampNow();
}

function isEntryComplete(entry){
  const status = entry.querySelector('[data-field="status"]')?.value || "";
  const comments = (entry.querySelector('[data-field="comments"]')?.value || "").trim();
  return status === "Inspected" || (status === "Cant Access" && comments !== "");
}

function updateCardProgress(card){
  const entries = card.querySelectorAll(".inspection-entry");
  const progressEl = card.querySelector("[data-level-progress]");
  let completed = 0;
  let defaultTotal = 0;
  let defaultCompleted = 0;

  entries.forEach(entry => {
    const complete = isEntryComplete(entry);
    if(complete) completed += 1;
    if(entry.dataset.default === "true"){
      defaultTotal += 1;
      if(complete) defaultCompleted += 1;
    }
  });

  if(progressEl) progressEl.textContent = `${completed} / ${entries.length} Completed`;
  card.classList.toggle("level-card-complete", defaultTotal > 0 && defaultCompleted === defaultTotal);
}

function toggleCollapseCard(card){
  const collapsed = card.classList.toggle("collapsed");
  const btn = card.querySelector("[data-collapse-toggle]");
  if(btn) btn.textContent = collapsed ? "▸" : "▾";
}

function handleInspectionStatusClick(btn){
  const entry = btn.closest(".inspection-entry");
  const value = btn.dataset.value; // "Inspected" | "Cant Access"
  const hidden = entry.querySelector('[data-field="status"]');
  if(hidden) hidden.value = value;

  entry.querySelectorAll(".inspection-status-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.value === value);
  });

  const commentsWrap = entry.querySelector("[data-comments-wrap]");
  if(commentsWrap) commentsWrap.classList.toggle("show", value === "Cant Access");

  refreshEntryTimestamp(entry);
  const card = entry.closest(".level-card");
  if(card) updateCardProgress(card);
}

function initLevelChecksEvents(){
  const container = document.getElementById("levelsContainer");
  if(!container) return;

  container.addEventListener("click", (e) => {
    const collapseBtn = e.target.closest("[data-collapse-toggle]");
    if(collapseBtn){
      toggleCollapseCard(collapseBtn.closest(".level-card"));
      return;
    }

    const statusBtn = e.target.closest(".inspection-status-btn");
    if(statusBtn){ handleInspectionStatusClick(statusBtn); return; }

    const clearBtn = e.target.closest("[data-clear-entry]");
    if(clearBtn){
      const entry = clearBtn.closest(".inspection-entry");
      if(confirm("Clear this inspection entry?")){
        clearInspectionEntry(entry);
      }
      return;
    }

    const removeEntryBtn = e.target.closest("[data-remove-entry]");
    if(removeEntryBtn){
      const entry = removeEntryBtn.closest(".inspection-entry");
      const card = removeEntryBtn.closest(".level-card");
      if(confirm("Remove this inspection entry?")){
        removeInspectionEntry(card, entry);
      }
      return;
    }

    const addInspectionBtn = e.target.closest("[data-add-inspection]");
    if(addInspectionBtn){
      addInspectionEntry(addInspectionBtn.closest(".level-card"));
      return;
    }

    const removeLevelBtn = e.target.closest(".remove-level-btn");
    if(removeLevelBtn){
      const card = removeLevelBtn.closest(".level-card");
      if(confirm("Remove this Level Card and all its inspection entries?")){
        removeLevelCard(card);
      }
      return;
    }
  });

  // blur doesn't bubble, so this listener runs in the capture phase —
  // it still fires for every matching descendant as focus moves through it.
  container.addEventListener("blur", (e) => {
    if(e.target.matches('.inspection-entry [data-field="reading"], .inspection-entry [data-field="comments"]')){
      const entry = e.target.closest(".inspection-entry");
      refreshEntryTimestamp(entry);
      const card = entry.closest(".level-card");
      if(card) updateCardProgress(card);
    }
  }, true);
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
      stope_name: getVal("stope_name"),
      status: getVal("status"), // "Plug" | "Body"
      hot_seating: getVal("hot_seating"), // "AM" | "PM" | "Both"
      fill_point: getVal("fill_point"),
      total_m3: getVal("total_m3"),
      plug_m3: getVal("plug_m3"),
      poured_m3: getVal("poured_m3"),
      time_start: getVal("time_start"),
      time_pour_finished: getVal("time_pour_finished"),
      time_flush_finished: getVal("time_flush_finished"),
      flush_times: Array.from(card.querySelectorAll('[data-field="flush_time"]')).map(el => (el.value || "").trim()),
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

  const levels = Array.from(document.querySelectorAll("#levelsContainer .level-card")).map((card, idx) => {
    const getCardVal = (field) => {
      const el = card.querySelector(`[data-field="${field}"]`);
      return (el && el.value ? el.value : "").trim();
    };

    const entries = Array.from(card.querySelectorAll(".inspection-entry")).map((entry, eIdx) => {
      const getVal = (field) => {
        const el = entry.querySelector(`[data-field="${field}"]`);
        return (el && el.value ? el.value : "").trim();
      };
      return {
        entry_number: eIdx + 1,
        reading: getVal("reading"),
        status: getVal("status"), // "Inspected" | "Cant Access" | ""
        comments: getVal("comments"),
        timestamp: getVal("timestamp")
      };
    });

    return {
      level_number: idx + 1,
      level_name: getCardVal("level_name"),
      entries
    };
  });

  return {
    isTest,
    shift_date: val("shift_date") || today,
    shift_type: val("shift_type") || "D/S",
    operator: val("operator") || (isTest ? "Test User" : ""),
    shift_boss: val("shift_boss"),
    plant_operator: val("plant_operator"),
    paste_runner: val("paste_runner"),
    stopes,
    levels
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
  "Body": "pill-ok",
  "Requires Attention": "pill-warn",
  "Plug": "pill-curing",
  "N/A": "pill-na",
  "AM": "pill-info",
  "PM": "pill-info",
  "Both": "pill-info"
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

  const flushTimes = (stope.flush_times && stope.flush_times.length) ? stope.flush_times : [""];
  const flushRows = flushTimes.map((t, i) => `
            <tr>
              <td class="label">Time of Flush ${i + 1}</td><td>${pdfTextOrDash(t)}</td>
              <td class="label"></td><td></td>
            </tr>`).join("");

  const heading = stope.stope_name ? escapeHtml(stope.stope_name.toUpperCase()) : "NEW STOPE";

  return `
        <div class="pdf-stope-card">
          <div class="pdf-stope-head">
            <h3>STOPE — ${heading}</h3>
            <span class="pdf-stope-id">Stope Entry ${n}</span>
          </div>

          <div class="pdf-status-row">
            <div>
              <span>Stope Type</span>
              ${pdfPillHTML(stope.status, "Not Set")}
            </div>
            <div class="pdf-status-other">
              <span>Hot Seating</span>
              ${pdfPillHTML(stope.hot_seating, "Not Set")}
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
              <td class="label">Pour Finished</td><td>${pdfTextOrDash(stope.time_pour_finished)}</td>
            </tr>
            <tr>
              <td class="label">Flush Finished</td><td>${pdfTextOrDash(stope.time_flush_finished)}</td>
              <td class="label"></td><td></td>
            </tr>${flushRows}
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

const INSPECTION_STATUS_META = {
  "Inspected": "pill-ok",
  "Cant Access": "pill-warn"
};

function buildPdfLevelCardHTML(level, n){
  const filledEntries = (level.entries || []).filter(e =>
    (e.reading || "").trim() || (e.status || "").trim() || (e.comments || "").trim()
  );

  const heading = level.level_name ? escapeHtml(level.level_name) : `Level Card ${n}`;

  if(filledEntries.length === 0){
    return `
        <div class="pdf-stope-card">
          <div class="pdf-stope-head">
            <h3>${heading}</h3>
            <span class="pdf-stope-id">Level Card ${n}</span>
          </div>
          <div class="pdf-comments-inline">
            <span>No inspection entries recorded.</span>
          </div>
        </div>`;
  }

  const rows = filledEntries.map(entry => {
    const status = entry.status || "";
    const statusLabel = status === "Cant Access" ? "Can't Access" : (status || "Not Set");
    return `
            <tr>
              <td class="label">Entry ${entry.entry_number}</td>
              <td>${pdfTextOrDash(entry.reading)}</td>
              <td><span class="pdf-pill ${status ? (INSPECTION_STATUS_META[status] || "pill-na") : "pill-na"}">${escapeHtml(statusLabel)}</span></td>
              <td>${pdfTextOrDash(entry.comments)}</td>
              <td>${pdfTextOrDash(entry.timestamp)}</td>
            </tr>`;
  }).join("");

  return `
        <div class="pdf-stope-card">
          <div class="pdf-stope-head">
            <h3>${heading}</h3>
            <span class="pdf-stope-id">Level Card ${n}</span>
          </div>
          <table class="pdf-table pdf-checklist-table">
            <tr>
              <td class="label">Entry</td><td class="label">Reading</td><td class="label">Status</td>
              <td class="label">Comments</td><td class="label">Recorded</td>
            </tr>${rows}
          </table>
        </div>`;
}

function buildPdfLevelsHTML(levels){
  const relevant = (levels || []).filter(lvl =>
    (lvl.level_name || "").trim() || (lvl.entries || []).some(e => (e.reading || e.status || e.comments))
  );
  if(relevant.length === 0){
    return `<div class="pdf-level-empty">No level checks recorded.</div>`;
  }
  return relevant.map((lvl, idx) => buildPdfLevelCardHTML(lvl, idx + 1)).join("");
}

async function populatePdfTemplate(report){
  pdfSetText("pdf_shift_date", report.shift_date);
  pdfSetText("pdf_shift_type", report.shift_type);
  pdfSetText("pdf_operator", report.operator);
  pdfSetText("pdf_shift_boss", report.shift_boss);
  pdfSetText("pdf_plant_operator", report.plant_operator);
  pdfSetText("pdf_paste_runner", report.paste_runner);
  pdfSetText("pdf_generated_at", new Date().toLocaleString());

  const stopesContainer = document.getElementById("pdfStopesContainer");
  stopesContainer.innerHTML = (report.stopes || [])
    .map((stope, idx) => buildPdfStopeCardHTML(stope, idx + 1))
    .join("");

  const levelsContainer = document.getElementById("pdfLevelsContainer");
  if(levelsContainer){
    levelsContainer.innerHTML = buildPdfLevelsHTML(report.levels);
  }

  // Photos are embedded as <img src="data:..."> — make sure they've
  // actually decoded before html2canvas captures the page, or the
  // PDF can come out with blank image boxes.
  await waitForImages(stopesContainer);
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
  document.getElementById("addLevelBtn").addEventListener("click", () => addLevelCard());

  initStopesContainerEvents();
  initLevelChecksEvents();
  // No stope card is seeded — the form opens with zero stopes, per spec.
  for(let i = 0; i < 6; i++){
    addLevelCard(false); // 6 default Level Cards, no scroll during initial seed
  }
});
