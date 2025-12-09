
const nodemailer = require('nodemailer');

// Create reusable transporter object using the default SMTP transport
// NOTE: For production, configure this with real SMTP credentials
let transporter;

async function initMailer() {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer.createTestAccount();

    transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });

    console.log('Nodemailer initialized with Ethereal Test Account');
    console.log('Preview URL will be logged for each sent email.');
}

// Fallback init
initMailer().catch(console.error);

async function sendResultEmail(toEmail, name, resultLabel, pdfBuffer) {
    if (!transporter) await initMailer();

    const subject = `TechOps Academy vizsgaeredmény – ${resultLabel}`;
    const text = `Szia ${name}!\n\n` +
        `Csatolva találod a TechOps Academy vizsgád részletes eredményét PDF formátumban.\n\n` +
        `Üdvözlettel,\nTechOps Academy`;

    try {
        const info = await transporter.sendMail({
            from: '"TechOps Academy" <academy@techops-example.com>', // sender address
            to: toEmail, // list of receivers
            subject: subject, // Subject line
            text: text, // plain text body
            attachments: [
                {
                    filename: `TechOps_Academy_Eredmeny_${name.replace(/\s+/g, '_')}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        console.log("Message sent: %s", info.messageId);
        // Preview only available when sending through an Ethereal account
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

        return { success: true, messageId: info.messageId, preview: nodemailer.getTestMessageUrl(info) };
    } catch (e) {
        console.error("Error sending email:", e);
        return { success: false, error: e.message };
    }
}

module.exports = { sendResultEmail };
