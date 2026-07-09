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

/* ============================================================
   PDF TEMPLATE POPULATION
   Fills the hidden #pdfTemplate (see index.html) with the same
   values already collected by collectReport(). Does not touch
   collectReport() or any existing form-reading logic.
   ============================================================ */

const PDF_STATUS_META = {
  "OK": "pill-ok",
  "Complete": "pill-ok",
  "Requires Attention": "pill-warn",
  "Stopped": "pill-warn",
  "Ongoing": "pill-info",
  "N/A": "pill-na",
  "Not Started": "pill-na"
};

function pdfSetText(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  const str = (value === undefined || value === null || String(value).trim() === "") ? "" : String(value);
  el.textContent = str || "—";
}

function pdfSetPill(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  const str = (value === undefined || value === null || String(value).trim() === "") ? "" : String(value);
  el.textContent = str || "—";
  el.className = "pdf-pill " + (PDF_STATUS_META[str] || "pill-na");
}

function populatePdfTemplate(report){
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

  (report.stopes || []).forEach((stope, idx) => {
    const n = idx + 1;

    // quick summary row (legacy fields)
    pdfSetText(`pdf_stope${n}_quick_id`, stope.id);
    pdfSetText(`pdf_stope${n}_quick_status`, stope.status);
    pdfSetText(`pdf_stope${n}_quick_total`, stope.total_m3);

    // detailed checklist fields
    pdfSetText(`pdf_stope${n}_id`, stope.stope_id);
    pdfSetPill(`pdf_stope${n}_status`, stope.detail_status);
    pdfSetText(`pdf_stope${n}_fill_point`, stope.fill_point);
    pdfSetText(`pdf_stope${n}_total_m3`, stope.detail_total_m3);
    pdfSetText(`pdf_stope${n}_plug_m3`, stope.plug_m3);
    pdfSetText(`pdf_stope${n}_poured_m3`, stope.poured_m3);
    pdfSetPill(`pdf_stope${n}_containment_zone`, stope.containment_zone);
    pdfSetPill(`pdf_stope${n}_exclusion_zone`, stope.exclusion_zone);
    pdfSetPill(`pdf_stope${n}_cameras`, stope.cameras);
    pdfSetPill(`pdf_stope${n}_flush_valve`, stope.flush_valve);
    pdfSetPill(`pdf_stope${n}_signage`, stope.signage);
    pdfSetPill(`pdf_stope${n}_wall_status`, stope.wall_status);
    pdfSetPill(`pdf_stope${n}_bund_status`, stope.bund_status);
    pdfSetPill(`pdf_stope${n}_changeover_points`, stope.changeover_points);
    pdfSetText(`pdf_stope${n}_comments`, stope.comments);
  });
}

/* ============================================================
   PDF GENERATION (html2canvas + jsPDF)
   Captures the populated #pdfTemplate as an image and lays it
   into an A4 PDF, splitting across multiple pages if the
   content is taller than one page.
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

async function submitReport(isTest=false){
  try{
    setStatus("busy", isTest ? "Sending test..." : "Submitting shift sheet...");
    const report = collectReport(isTest);

    populatePdfTemplate(report);
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
});
