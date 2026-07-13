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
    case "N/A": return { icon: "⊘", label: "N/A", cls: "cycle-na" };
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
          <div class="status-btn-group three-col" role="group">
            <button type="button" class="status-btn" data-value="Plug">
              <span class="status-dot dot-curing"></span>PLUG
            </button>
            <button type="button" class="status-btn" data-value="Body">
              <span class="status-dot dot-pouring"></span>BODY
            </button>
            <button type="button" class="status-btn" data-value="Other">
              <span class="status-dot dot-other"></span>OTHER
            </button>
          </div>
          <input type="hidden" id="stope_${sid}_status" data-field="status" value="">

          <div class="other-status-wrap" data-status-other-wrap>
            <label>Describe Stope Type
              <textarea id="stope_${sid}_status_other_comments" data-field="status_other_comments" placeholder="Describe the stope type..."></textarea>
            </label>
          </div>

          <div class="stope-metrics-grid">
            <label>Level of Fill Point <input id="stope_${sid}_fill_point" data-field="fill_point" type="text" placeholder="e.g. 2.5m"></label>
            <label>Total m³ <input id="stope_${sid}_total_m3" data-field="total_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Plug m³ <input id="stope_${sid}_plug_m3" data-field="plug_m3" type="number" step="0.1" placeholder="0.0"></label>
            <label>Poured m³ <input id="stope_${sid}_poured_m3" data-field="poured_m3" type="number" step="0.1" placeholder="0.0"></label>
          </div>

          <div class="status-group-label">Plug Complete</div>
          <div class="status-btn-group two-col" role="group">
            <button type="button" class="hotseat-btn" data-hotseat-field="plug_complete" data-value="Yes">YES</button>
            <button type="button" class="hotseat-btn" data-hotseat-field="plug_complete" data-value="No">NO</button>
          </div>
          <input type="hidden" id="stope_${sid}_plug_complete" data-field="plug_complete" value="">

          <div class="checklist-divider">Times</div>
          <div class="stope-times-grid">
            <label>Start Time <input id="stope_${sid}_time_start" data-field="time_start" type="time"></label>
          </div>
          <div class="status-group-label">Hot Seating Start of Shift?</div>
          <div class="status-btn-group two-col" role="group">
            <button type="button" class="hotseat-btn" data-hotseat-field="hot_seating_start" data-value="Yes">YES</button>
            <button type="button" class="hotseat-btn" data-hotseat-field="hot_seating_start" data-value="No">NO</button>
          </div>
          <input type="hidden" id="stope_${sid}_hot_seating_start" data-field="hot_seating_start" value="">

          <div class="stope-times-grid">
            <label>Pour Finished <input id="stope_${sid}_time_pour_finished" data-field="time_pour_finished" type="time"></label>
          </div>
          <div class="status-group-label">Hot Seating over Shift Change?</div>
          <div class="status-btn-group two-col" role="group">
            <button type="button" class="hotseat-btn" data-hotseat-field="hot_seating_pour_finished" data-value="Yes">YES</button>
            <button type="button" class="hotseat-btn" data-hotseat-field="hot_seating_pour_finished" data-value="No">NO</button>
          </div>
          <input type="hidden" id="stope_${sid}_hot_seating_pour_finished" data-field="hot_seating_pour_finished" value="">

          <div class="checklist-divider">Time of Flush</div>
          <div class="flush-times-list" data-flush-list></div>
          <button type="button" class="btn ghost add-flush-btn" data-add-flush>+ Add Another Flush</button>

          <div class="checklist-divider">Level Checks</div>
          <div class="level-entries-list" data-level-entries></div>
          <button type="button" class="btn ghost add-level-entry-btn" data-add-level-entry>+ Add Level</button>

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
          <div class="flush-time-row-top">
            <label class="flush-time-label">
              <span data-flush-label-text>Time of Flush ${n}</span>
              <input type="time" id="stope_${sid}_flush_${fid}" data-field="flush_time" data-flush-id="${fid}">
            </label>
            <button type="button" class="remove-flush-btn" data-flush-id="${fid}">Remove</button>
          </div>
          <label class="flush-comments-field">Comments
            <textarea id="stope_${sid}_flush_${fid}_comments" data-field="flush_comments" data-flush-id="${fid}" placeholder="Notes about this flush..."></textarea>
          </label>
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
  addLevelEntry(card); // every stope starts with exactly one Level Check row
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

  const otherWrap = card.querySelector("[data-status-other-wrap]");
  if(otherWrap) otherWrap.classList.toggle("show", value === "Other");
}

function handleHotSeatingClick(btn){
  const card = btn.closest(".stope-card");
  const field = btn.dataset.hotseatField;
  const value = btn.dataset.value;
  const hidden = card.querySelector(`[data-field="${field}"]`);
  if(hidden) hidden.value = value;

  card.querySelectorAll(`.hotseat-btn[data-hotseat-field="${field}"]`).forEach(b => {
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
      removeFlushRow(card, row);
      return;
    }

    const addLevelBtn = e.target.closest("[data-add-level-entry]");
    if(addLevelBtn){
      addLevelEntry(addLevelBtn.closest(".stope-card"));
      return;
    }

    const removeLevelBtn = e.target.closest("[data-remove-level-entry]");
    if(removeLevelBtn){
      const card = removeLevelBtn.closest(".stope-card");
      const entry = removeLevelBtn.closest(".level-entry");
      if(confirm("Remove this level and its check history?")){
        removeLevelEntry(card, entry);
      }
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
    if(e.target.matches('.level-check-box input[type="checkbox"]')){
      handleLevelCheckboxChange(e.target);
      return;
    }
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
   LEVEL CHECKS (per stope)
   Each Stope card gets its own Level Checks subsection: up to 8
   levels, each with 5 independent inspection checkboxes. Ticking
   a checkbox stamps the current time beside it; unticking clears
   only that checkbox's timestamp. The level name is typed once
   and stays visible for the rest of the shift.
   ============================================================ */

const LEVEL_CHECKS_MAX = 8;
let levelEntryUidCounter = 0;

function formatTime24h(date){
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function levelEntryTemplate(sid, lvid){
  const checkboxes = [1, 2, 3, 4, 5, 6].map(n => `
              <label class="level-check-box">
                <input type="checkbox" id="stope_${sid}_lvl_${lvid}_check_${n}" data-check-num="${n}">
                <span class="check-num">${n}</span>
                <span class="check-time" data-check-time="${n}">—</span>
              </label>
              <input type="hidden" id="stope_${sid}_lvl_${lvid}_check_${n}_time" data-field="check_${n}_time" value="">`).join("");

  return `
        <div class="level-entry" data-lvid="${lvid}">
          <div class="level-entry-row">
            <label class="level-entry-name">Level
              <input type="text" id="stope_${sid}_lvl_${lvid}_name" data-field="level_name" placeholder="e.g. 3550">
            </label>
            <button type="button" class="remove-level-entry-btn" data-remove-level-entry>Remove</button>
          </div>
          <div class="level-checks-row">${checkboxes}
          </div>
        </div>`;
}

function addLevelEntry(card){
  const list = card.querySelector("[data-level-entries]");
  if(!list) return;
  if(list.querySelectorAll(".level-entry").length >= LEVEL_CHECKS_MAX) return;

  const sid = card.dataset.sid;
  levelEntryUidCounter += 1;
  const lvid = levelEntryUidCounter;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = levelEntryTemplate(sid, lvid).trim();
  list.appendChild(wrapper.firstElementChild);
  updateAddLevelButtonState(card);
}

function removeLevelEntry(card, entry){
  const list = card.querySelector("[data-level-entries]");
  if(list && list.querySelectorAll(".level-entry").length <= 1) return; // keep at least one level row
  entry.remove();
  updateAddLevelButtonState(card);
}

function updateAddLevelButtonState(card){
  const list = card.querySelector("[data-level-entries]");
  const addBtn = card.querySelector("[data-add-level-entry]");
  if(!list || !addBtn) return;
  const count = list.querySelectorAll(".level-entry").length;
  const atMax = count >= LEVEL_CHECKS_MAX;
  addBtn.disabled = atMax;
  addBtn.textContent = atMax ? `Maximum ${LEVEL_CHECKS_MAX} Levels Reached` : "+ Add Level";
}

function handleLevelCheckboxChange(checkbox){
  const num = checkbox.dataset.checkNum;
  const entry = checkbox.closest(".level-entry");
  if(!entry) return;
  const timeHidden = entry.querySelector(`[data-field="check_${num}_time"]`);
  const timeDisplay = entry.querySelector(`[data-check-time="${num}"]`);
  const checkBoxLabel = checkbox.closest(".level-check-box");

  if(checkbox.checked){
    const stamp = formatTime24h(new Date());
    if(timeHidden) timeHidden.value = stamp;
    if(timeDisplay) timeDisplay.textContent = stamp;
  } else {
    // Unticking clears only this checkbox's own timestamp — the others
    // on the same level are untouched.
    if(timeHidden) timeHidden.value = "";
    if(timeDisplay) timeDisplay.textContent = "—";
  }
  if(checkBoxLabel) checkBoxLabel.classList.toggle("checked-visual", checkbox.checked);
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
      status: getVal("status"), // "Plug" | "Body" | "Other"
      status_other_comments: getVal("status_other_comments"),
      fill_point: getVal("fill_point"),
      total_m3: getVal("total_m3"),
      plug_m3: getVal("plug_m3"),
      plug_complete: getVal("plug_complete"), // "Yes" | "No"
      poured_m3: getVal("poured_m3"),
      time_start: getVal("time_start"),
      hot_seating_start: getVal("hot_seating_start"), // "Yes" | "No"
      time_pour_finished: getVal("time_pour_finished"),
      hot_seating_pour_finished: getVal("hot_seating_pour_finished"), // "Yes" | "No"
      flush_entries: Array.from(card.querySelectorAll(".flush-time-row")).map(row => {
        const timeEl = row.querySelector('[data-field="flush_time"]');
        const commentsEl = row.querySelector('[data-field="flush_comments"]');
        return {
          time: (timeEl && timeEl.value ? timeEl.value : "").trim(),
          comments: (commentsEl && commentsEl.value ? commentsEl.value : "").trim()
        };
      }),
      level_checks: Array.from(card.querySelectorAll(".level-entry")).map((entry, lvIdx) => {
        const nameEl = entry.querySelector('[data-field="level_name"]');
        const checks = [1, 2, 3, 4, 5, 6].map(n => {
          const checkbox = entry.querySelector(`[data-check-num="${n}"]`);
          const timeEl = entry.querySelector(`[data-field="check_${n}_time"]`);
          return {
            check_number: n,
            checked: !!(checkbox && checkbox.checked),
            time: (timeEl && timeEl.value ? timeEl.value : "").trim()
          };
        });
        return {
          level_number: lvIdx + 1,
          level_name: (nameEl && nameEl.value ? nameEl.value : "").trim(),
          checks
        };
      }),
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
  "Body": "pill-ok",
  "Requires Attention": "pill-warn",
  "Plug": "pill-curing",
  "Other": "pill-na",
  "N/A": "pill-na",
  "Yes": "pill-warn",
  "No": "pill-ok"
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
    const issueCell = stope[`${key}_issue`] ? pdfTextOrDash(stope[`${key}_issue`]) : "—";
    return `
            <tr>
              <td class="label">${escapeHtml(label)}</td>
              <td>${pdfPillHTML(stope[key], "Not Checked")}</td>
              <td>${issueCell}${photosHTML}</td>
            </tr>`;
  }).join("");

  const flushEntries = (stope.flush_entries && stope.flush_entries.length)
    ? stope.flush_entries.filter(e => (e.time || "").trim() || (e.comments || "").trim())
    : [];
  const flushRows = flushEntries.length
    ? flushEntries.map((entry, i) => `
            <tr>
              <td class="label">Time of Flush ${i + 1}</td><td>${pdfTextOrDash(entry.time)}</td>
              <td class="label">Comments</td><td>${entry.comments ? pdfTextOrDash(entry.comments) : "—"}</td>
            </tr>`).join("")
    : `
            <tr><td colspan="4">No flush entries recorded.</td></tr>`;

  const heading = stope.stope_name ? escapeHtml(stope.stope_name.toUpperCase()) : "NEW STOPE";
  const isOtherType = stope.status === "Other";

  const delaysBlock = (stope.delays || "").trim() ? `
          <div class="pdf-comments-inline" data-pdf-block>
            <span class="pdf-comments-label">Delays</span>
            <span>${pdfTextOrDash(stope.delays)}</span>
          </div>` : "";

  const notesBlock = (stope.general_notes || "").trim() ? `
          <div class="pdf-comments-inline" data-pdf-block>
            <span class="pdf-comments-label">General Notes</span>
            <span>${pdfTextOrDash(stope.general_notes)}</span>
          </div>` : "";

  const noCommentsBlock = (delaysBlock || notesBlock) ? "" : `
          <div class="pdf-comments-inline" data-pdf-block>
            <span>No additional comments recorded.</span>
          </div>`;

  return `
        <div class="pdf-stope-card">
          <div class="pdf-stope-head" data-pdf-block>
            <h3>STOPE — ${heading}</h3>
            <span class="pdf-stope-id">Stope Entry ${n}</span>
          </div>

          <div class="pdf-checklist-title" data-pdf-block>Stope Details</div>
          <table class="pdf-table pdf-metrics-table" data-pdf-block>
            <tr>
              <td class="label">Stope Type</td><td>${pdfPillHTML(stope.status, "Not Set")}</td>
              <td class="label"></td><td></td>
            </tr>${isOtherType ? `
            <tr>
              <td class="label">Stope Type Description</td><td colspan="3">${pdfTextOrDash(stope.status_other_comments)}</td>
            </tr>` : ""}
          </table>

          <div class="pdf-checklist-title" data-pdf-block>Pour and Plug Details</div>
          <table class="pdf-table pdf-metrics-table" data-pdf-block>
            <tr>
              <td class="label">Level of Fill Point</td><td>${pdfTextOrDash(stope.fill_point)}</td>
              <td class="label">Plug m³</td><td>${pdfTextOrDash(stope.plug_m3)}</td>
            </tr>
            <tr>
              <td class="label">Total m³</td><td>${pdfTextOrDash(stope.total_m3)}</td>
              <td class="label">Poured m³</td><td>${pdfTextOrDash(stope.poured_m3)}</td>
            </tr>
            <tr>
              <td class="label">Plug Complete</td><td>${pdfPillHTML(stope.plug_complete, "Not Set")}</td>
              <td class="label"></td><td></td>
            </tr>
          </table>

          <div class="pdf-checklist-title" data-pdf-block>Times</div>
          <table class="pdf-table pdf-metrics-table" data-pdf-block>
            <tr>
              <td class="label">Start Time</td><td>${pdfTextOrDash(stope.time_start)}</td>
              <td class="label">Hot Seating Start of Shift?</td><td>${pdfPillHTML(stope.hot_seating_start, "Not Set")}</td>
            </tr>
            <tr>
              <td class="label">Pour Finished</td><td>${pdfTextOrDash(stope.time_pour_finished)}</td>
              <td class="label">Hot Seating over Shift Change?</td><td>${pdfPillHTML(stope.hot_seating_pour_finished, "Not Set")}</td>
            </tr>
          </table>

          <div class="pdf-checklist-title" data-pdf-block>Time of Flush</div>
          <table class="pdf-table pdf-metrics-table" data-pdf-block>${flushRows}
          </table>

          <div class="pdf-checklist-title" data-pdf-block>Stope Checklist</div>
          <table class="pdf-table pdf-checklist-table" data-pdf-block>
            <tr>
              <td class="label">Item</td><td class="label">Status</td><td class="label">Issue Details / Photos</td>
            </tr>${checklistRows}
          </table>

          <div class="pdf-checklist-title" data-pdf-block>Level Checks</div>
          ${buildPdfLevelChecksTableHTML(stope.level_checks)}

          <div class="pdf-checklist-title" data-pdf-block>Comments</div>${delaysBlock}${notesBlock}${noCommentsBlock}
        </div>`;
}

function buildPdfLevelChecksTableHTML(levelChecks){
  const relevant = (levelChecks || []).filter(lvl =>
    (lvl.level_name || "").trim() || (lvl.checks || []).some(c => c.checked)
  );
  if(relevant.length === 0){
    return `<div class="pdf-level-empty" data-pdf-block>No level checks recorded for this stope.</div>`;
  }

  const rows = relevant.map(lvl => {
    const cells = (lvl.checks || []).map(c =>
      `<td>${c.checked ? `✓ ${escapeHtml(c.time || "")}` : "—"}</td>`
    ).join("");
    return `<tr><td class="label">${pdfTextOrDash(lvl.level_name)}</td>${cells}</tr>`;
  }).join("");

  return `
          <table class="pdf-table pdf-level-checks-table" data-pdf-block>
            <tr>
              <td class="label">Level</td><td class="label">Check 1</td><td class="label">Check 2</td>
              <td class="label">Check 3</td><td class="label">Check 4</td><td class="label">Check 5</td>
              <td class="label">Check 6</td>
            </tr>${rows}
          </table>`;
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
  pdfSetText("pdf_operator_table", report.operator);
  pdfSetText("pdf_operator_submission", report.operator);
  pdfSetText("pdf_shift_boss", report.shift_boss);
  pdfSetText("pdf_plant_operator", report.plant_operator);
  pdfSetText("pdf_paste_runner", report.paste_runner);
  pdfSetText("pdf_generated_at", new Date().toLocaleString());

  const stopesContainer = document.getElementById("pdfStopesContainer");
  stopesContainer.innerHTML = (report.stopes || [])
    .map((stope, idx) => buildPdfStopeCardHTML(stope, idx + 1))
    .join("");

  // Photos are embedded as <img src="data:..."> — make sure they've
  // actually decoded before html2canvas captures the page, or the
  // PDF can come out with blank image boxes.
  await waitForImages(stopesContainer);

  const template = document.getElementById("pdfTemplate");
  const levelCount = (report.stopes || []).reduce((sum, s) => sum + (s.level_checks || []).length, 0);
  console.log("[PDF] Hidden template populated:", {
    stopes: (report.stopes || []).length,
    levelCards: levelCount,
    templateScrollWidth: template ? template.scrollWidth : null,
    templateScrollHeight: template ? template.scrollHeight : null
  });
}

/* ============================================================
   PDF GENERATION (html2canvas + jsPDF)

   The template is captured as one tall canvas, then sliced into
   A4 pages. Naively slicing at fixed pixel intervals can cut a
   table or card in half, so instead every element marked
   data-pdf-block is measured BEFORE capture, and page breaks are
   only ever placed at one of those boundaries (never inside a
   block). Page numbers are the one thing drawn directly with
   jsPDF's text() rather than as HTML — the total page count can
   only be known after pagination is computed, so a pure-HTML
   footer can't say "of N" in advance. Everything else in the PDF
   body is still rendered HTML captured via html2canvas.
   ============================================================ */

async function buildPdfBlob(){
  const template = document.getElementById("pdfTemplate");
  if(!template){
    throw new Error("PDF template not found in page.");
  }

  console.log("[PDF] Template dimensions before capture:", {
    scrollWidth: template.scrollWidth,
    scrollHeight: template.scrollHeight
  });

  if(template.scrollWidth === 0 || template.scrollHeight === 0){
    throw new Error("PDF template has zero size — it is not rendering correctly.");
  }

  const blockBoundaries = Array.from(template.querySelectorAll("[data-pdf-block]"))
    .map(el => el.offsetTop)
    .sort((a, b) => a - b);

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

  console.log("[PDF] Captured canvas:", canvas.width + "x" + canvas.height + "px");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  const canvasPxPerCssPx = canvas.width / template.scrollWidth;
  const pageHeightInCanvasPx = pageHeight * (canvas.width / imgWidth);
  const boundariesInCanvasPx = blockBoundaries
    .map(y => y * canvasPxPerCssPx)
    .filter(y => y > 0 && y < canvas.height);

  function nextSafeBreak(currentY){
    const naiveBreak = currentY + pageHeightInCanvasPx;
    if(naiveBreak >= canvas.height) return canvas.height;
    let best = null;
    for(const boundary of boundariesInCanvasPx){
      if(boundary > currentY && boundary <= naiveBreak){
        best = boundary;
      } else if(boundary > naiveBreak){
        break;
      }
    }
    // No safe boundary fits on this page (a single block taller than one
    // page) — fall back to the naive cut rather than looping forever.
    return best || naiveBreak;
  }

  const pageBreaksCanvasPx = [];
  let cursor = 0;
  while(cursor < canvas.height){
    const next = nextSafeBreak(cursor);
    pageBreaksCanvasPx.push(next);
    cursor = next;
  }

  const totalPages = pageBreaksCanvasPx.length;

  let pageStart = 0;
  pageBreaksCanvasPx.forEach((pageEnd, idx) => {
    if(idx > 0) pdf.addPage();
    const offsetPt = -(pageStart * (imgWidth / canvas.width));
    pdf.addImage(imgData, "PNG", 0, offsetPt, imgWidth, imgHeight);

    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Page ${idx + 1} of ${totalPages}`, pageWidth - 40, pageHeight - 16, { align: "right" });

    pageStart = pageEnd;
  });

  console.log("[PDF] Paginated into", totalPages, "page(s)");

  return { blob: pdf.output("blob"), pageCount: totalPages };
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
   Same fetch target and payload shape as before. Debug logging
   added at every stage so a failure is traceable: form data
   collected, PDF template populated, PDF generated (size + page
   count), and whether the attachment reached the submit call.
   ============================================================ */

async function submitReport(isTest=false){
  try{
    setStatus("busy", isTest ? "Sending test..." : "Submitting shift sheet...");
    const report = collectReport(isTest);
    console.log("[PDF] Form data collected:", {
      shift_date: report.shift_date,
      operator: report.operator,
      stopeCount: (report.stopes || []).length
    });
    if(!report || !report.shift_date){
      throw new Error("Form data could not be collected — the report object is missing required fields.");
    }

    await populatePdfTemplate(report);
    // let the browser paint the populated template before capture
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    setStatus("busy", "Generating PDF...");
    const pdfResult = await buildPdfBlob();
    const pdfBlob = pdfResult && pdfResult.blob;
    if(!pdfBlob || pdfBlob.size === 0){
      throw new Error("Generated PDF was empty — refusing to submit a blank PDF.");
    }
    console.log("[PDF] Generated file size:", pdfBlob.size, "bytes across", pdfResult.pageCount, "page(s)");

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
      console.error("[PDF] Submission function reported failure:", data.error);
      throw new Error(data.error || "Submission failed");
    }

    console.log("[PDF] Attachment successfully passed to submission function. Drive PDF:", data.url);
    setStatus(setStatus("good", "Submitted successfully. PDF saved to Google Drive.");
  } catch(err){
    setStatus("bad", "Failed: " + err.message);
    console.error("[PDF] Submission failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("shift_date").value = new Date().toISOString().slice(0,10);
  document.getElementById("submitBtn").addEventListener("click", () => submitReport(false));
  document.getElementById("testBtn").addEventListener("click", () => submitReport(true));
  document.getElementById("addStopeBtn").addEventListener("click", () => addStope());

  initStopesContainerEvents();
  // No stope card is seeded — the form opens with zero stopes.
  // Each stope card (once added) starts with its own default
  // Time of Flush row and Level Check row.
});
