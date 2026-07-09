const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYKopfIXlyWsICDxeg5kV4GM3JQ8g-e7rHp0Kzt8Mzzj1mbmktBlv2FOf7gBEfSwwwOQ/exec";

function val(id){ return document.getElementById(id)?.value?.trim() || ""; }

function collectReport(isTest=false){
  const today = new Date().toISOString().slice(0,10);
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
    stopes: [
      {
        // existing fields (unchanged)
        id: val("stope_1_id"), status: val("stope_1_status"), total_m3: val("stope_1_total"),
        // new detail fields
        stope_id: val("stope1_id"),
        detail_status: val("stope1_status"),
        fill_point: val("stope1_fill_point"),
        detail_total_m3: val("stope1_total_m3"),
        plug_m3: val("stope1_plug_m3"),
        poured_m3: val("stope1_poured_m3"),
        containment_zone: val("stope1_containment_zone"),
        exclusion_zone: val("stope1_exclusion_zone"),
        cameras: val("stope1_cameras"),
        flush_valve: val("stope1_flush_valve"),
        signage: val("stope1_signage"),
        wall_status: val("stope1_wall_status"),
        bund_status: val("stope1_bund_status"),
        changeover_points: val("stope1_changeover_points"),
        comments: val("stope1_comments")
      },
      {
        id: val("stope_2_id"), status: val("stope_2_status"), total_m3: val("stope_2_total"),
        stope_id: val("stope2_id"),
        detail_status: val("stope2_status"),
        fill_point: val("stope2_fill_point"),
        detail_total_m3: val("stope2_total_m3"),
        plug_m3: val("stope2_plug_m3"),
        poured_m3: val("stope2_poured_m3"),
        containment_zone: val("stope2_containment_zone"),
        exclusion_zone: val("stope2_exclusion_zone"),
        cameras: val("stope2_cameras"),
        flush_valve: val("stope2_flush_valve"),
        signage: val("stope2_signage"),
        wall_status: val("stope2_wall_status"),
        bund_status: val("stope2_bund_status"),
        changeover_points: val("stope2_changeover_points"),
        comments: val("stope2_comments")
      },
      {
        id: val("stope_3_id"), status: val("stope_3_status"), total_m3: val("stope_3_total"),
        stope_id: val("stope3_id"),
        detail_status: val("stope3_status"),
        fill_point: val("stope3_fill_point"),
        detail_total_m3: val("stope3_total_m3"),
        plug_m3: val("stope3_plug_m3"),
        poured_m3: val("stope3_poured_m3"),
        containment_zone: val("stope3_containment_zone"),
        exclusion_zone: val("stope3_exclusion_zone"),
        cameras: val("stope3_cameras"),
        flush_valve: val("stope3_flush_valve"),
        signage: val("stope3_signage"),
        wall_status: val("stope3_wall_status"),
        bund_status: val("stope3_bund_status"),
        changeover_points: val("stope3_changeover_points"),
        comments: val("stope3_comments")
      }
    ]
  };
}

function setStatus(type, msg){
  const el = document.getElementById("status");
  el.className = "status show " + type;
  el.textContent = msg;
}

async function submitReport(isTest=false){
  try{
    setStatus("busy", isTest ? "Sending test..." : "Submitting shift sheet...");
    const report = collectReport(isTest);

    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ report })
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
});
