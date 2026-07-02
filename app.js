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
      { id: val("stope_1_id"), status: val("stope_1_status"), total_m3: val("stope_1_total") },
      { id: val("stope_2_id"), status: val("stope_2_status"), total_m3: val("stope_2_total") },
      { id: val("stope_3_id"), status: val("stope_3_status"), total_m3: val("stope_3_total") }
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
