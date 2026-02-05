const nodemailer = require("nodemailer");

/* ---------------- SEND EMAIL THROUGH NODEMAILER ---------------- */
const sendMail = async ({ email, subject, message = null, template = null, isHTML = false, attachments = null }) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_EMAIL_PASSWORD,
    },
  });

  // Use template if provided, otherwise use message
  let emailContent = template;
  if (!emailContent && message) {
    if (isHTML) {
      emailContent = message;
    } else {
      emailContent = `<p>${message.replace(/\n/g, '<br>')}</p>`;
    }
  }

  const mailOptions = {
    from: `"Home Service Management" <${process.env.SENDER_EMAIL}>`,
    to: email,
    subject,
    html: emailContent,
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);

  console.log(`Email sent successfully to ${email}`);
};

module.exports = {
  sendMail,
};
