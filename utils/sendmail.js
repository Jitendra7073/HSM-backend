const nodemailer = require("nodemailer");

/* ---------------- SEND EMAIL THROUGH NODEMAILER ---------------- */
const sendMail = async ({ email, subject, template, attachments = null }) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_EMAIL_PASSWORD,
    },
  });
  const mailOptions = {
    from: `"Home Service Management" <${process.env.SENDER_EMAIL}>`,
    to: email,
    subject,
    html: template,
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);

  console.log(`Email sent successfully`);
};

module.exports = {
  sendMail,
};
