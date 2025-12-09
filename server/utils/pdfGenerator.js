
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper to load logo as base64
function getBase64Image(file) {
    try {
        const filePath = path.join(__dirname, '../../public', file);
        if (fs.existsSync(filePath)) {
            const bitmap = fs.readFileSync(filePath);
            return Buffer.from(bitmap).toString('base64');
        }
    } catch (e) {
        console.error('Error loading image for PDF:', file, e);
    }
    return null;
}

async function generateExamPdf(examResult) {
    const {
        exam_type,
        passed,
        trainee_name,
        trainee_email,
        finished_at,
        attempt_no,
        theory_percent,
        simulation_percent,
        answers
    } = examResult;

    // Map snake_case to camelCase for the template
    const examType = exam_type || 'Unknown';
    const traineeName = trainee_name || 'Unknown';
    const traineeEmail = trainee_email || 'Unknown';
    const finishedAt = finished_at;
    const attemptNo = attempt_no;
    const theoryPercent = theory_percent;
    const simulationPercent = simulation_percent;

    const finalPassedLabel = passed ? 'SIKERES' : 'SIKERTELEN';

    // Generate HTML tables (reused logic from GAS)
    let theoryDetailsHtml = '';
    if (answers.theoryAnswers && answers.theoryAnswers.length > 0) {
        theoryDetailsHtml = `
        <table style="width:100%; border-collapse: collapse; margin-top: 10px; font-size: 12px;">
            <tr style="background-color: #471d6e; color: white;">
                <th style="padding: 5px; border: 1px solid #ddd;">#</th>
                <th style="padding: 5px; border: 1px solid #ddd;">Kérdés</th>
                <th style="padding: 5px; border: 1px solid #ddd;">Eredmény</th>
            </tr>`;

        answers.theoryAnswers.forEach((a, i) => {
            const rowColor = a.correct ? '#d4edda' : '#f8d7da';
            const resultText = a.correct ? '✓ Helyes' : '✗ Hibás';
            theoryDetailsHtml += `
            <tr style="background-color: ${rowColor};">
                <td style="padding: 5px; border: 1px solid #ddd; text-align: center;">${i + 1}</td>
                <td style="padding: 5px; border: 1px solid #ddd;">${a.question || 'Kérdés ' + (i + 1)}</td>
                <td style="padding: 5px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${resultText}</td>
            </tr>`;
        });
        theoryDetailsHtml += '</table>';
    }

    let simDetailsHtml = '';
    if (answers.simulationAnswers && answers.simulationAnswers.length > 0) {
        simDetailsHtml = `
        <table style="width:100%; border-collapse: collapse; margin-top: 10px; font-size: 12px;">
            <tr style="background-color: #c31e73; color: white;">
                <th style="padding: 5px; border: 1px solid #ddd;">#</th>
                <th style="padding: 5px; border: 1px solid #ddd;">Szituáció</th>
                <th style="padding: 5px; border: 1px solid #ddd;">Válasz</th>
                <th style="padding: 5px; border: 1px solid #ddd;">Eredmény</th>
            </tr>`;

        answers.simulationAnswers.forEach((a, i) => {
            const rowColor = a.correct ? '#d4edda' : '#f8d7da';
            const resultText = a.correct ? '✓ Helyes' : '✗ Hibás';
            const selectedText = a.selected === 'accept' ? 'Teljesítés' : 'Elutasítás';
            simDetailsHtml += `
            <tr style="background-color: ${rowColor};">
                <td style="padding: 5px; border: 1px solid #ddd; text-align: center;">${a.caseIndex || (i + 1)}</td>
                <td style="padding: 5px; border: 1px solid #ddd;">${a.title || 'Szituáció ' + (i + 1)}</td>
                <td style="padding: 5px; border: 1px solid #ddd; text-align: center;">${selectedText}</td>
                <td style="padding: 5px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${resultText}</td>
            </tr>`;
        });
        simDetailsHtml += '</table>';
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; border-bottom: 3px solid #c31e73; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #471d6e; }
        .subtitle { color: #c31e73; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
        .result-badge { display: inline-block; padding: 10px 30px; border-radius: 8px; font-size: 20px; font-weight: bold; margin: 20px 0; }
        .passed { background-color: #d4edda; color: #155724; border: 2px solid #27ae60; }
        .failed { background-color: #f8d7da; color: #721c24; border: 2px solid #e74c3c; }
        .info-box { background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 14px; }
        h2 { color: #471d6e; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 30px; font-size: 18px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">RACKHOST ACADEMY</div>
        <div class="subtitle">${examType.includes('L2') ? 'L2 Linux Basics' : 'L1 Support'} Képzés – Vizsgaeredmény</div>
      </div>

      <div style="text-align: center;">
        <div class="result-badge ${passed ? 'passed' : 'failed'}">${finalPassedLabel}</div>
      </div>

      <div class="info-box">
        <p><strong>Név:</strong> ${traineeName}</p>
        <p><strong>E-mail:</strong> ${traineeEmail}</p>
        <p><strong>Vizsga dátuma:</strong> ${new Date(finishedAt).toLocaleString('hu-HU')}</p>
        <p><strong>Vizsga típusa:</strong> ${examType}</p>
        <p><strong>Próbálkozás:</strong> #${attemptNo}</p>
      </div>

      <h2>Elméleti vizsga részletei</h2>
      <p><strong>Eredmény:</strong> ${theoryPercent}%</p>
      ${theoryDetailsHtml || '<p style="color: #888;">Nincs részletes adat.</p>'}

      <h2>Szimulációs vizsga részletei</h2>
      <p><strong>Eredmény:</strong> ${simulationPercent}%</p>
      ${simDetailsHtml || '<p style="color: #888;">Nincs részletes adat.</p>'}

      <div class="footer">
        <p>Ez a dokumentum automatikusan generálódott a TechOps Academy vizsgaplatformból.</p>
        <p>© ${new Date().getFullYear()} TechOps Academy – Minden jog fenntartva.</p>
      </div>
    </body>
    </html>
    `;

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        return pdfBuffer;

    } catch (e) {
        console.error('PDF Generation Error:', e);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { generateExamPdf };
