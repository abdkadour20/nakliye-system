// V7 Phase 3 - Optional real PDF engine
// Works safely without breaking the app. If jsPDF/html2canvas are installed,
// this service can export any visible HTML element as a fixed PDF.

export async function exportElementToPdf({ element, filename = 'document.pdf', options = {} }) {
  if (!element) throw new Error('PDF element is required');

  let html2canvasModule;
  let jsPdfModule;
  try {
    html2canvasModule = await import('html2canvas');
    jsPdfModule = await import('jspdf');
  } catch (error) {
    throw new Error('PDF motoru eksik. Lütfen kurun: npm install jspdf html2canvas');
  }

  const html2canvas = html2canvasModule.default || html2canvasModule;
  const { jsPDF } = jsPdfModule;

  const canvas = await html2canvas(element, {
    scale: options.scale || 2,
    useCORS: true,
    backgroundColor: options.backgroundColor || '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: options.orientation || 'portrait',
    unit: 'mm',
    format: options.format || 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
  } else {
    let position = 0;
    let remaining = imgHeight;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      remaining -= pageHeight;
      position -= pageHeight;
      if (remaining > 0) pdf.addPage();
    }
  }

  pdf.save(filename);
  return true;
}

export function downloadHtmlSnapshot({ html, filename = 'document.html' }) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getPdfInstallCommand() {
  return 'npm install jspdf html2canvas';
}
