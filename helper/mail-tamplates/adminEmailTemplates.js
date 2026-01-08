const BASE_URL = process.env.CLIENT_URL;
const HSM_LOGO =
  "https://res.cloudinary.com/dotm2ownb/image/upload/v1767090471/HSM-logo_mvqexc.png";

/* ---------------- USER RESTRICTED EMAIL ---------------- */
function userRestrictionEmailTemplate({ userName, reason }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Account Restricted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${userName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Your account has been restricted due to violations of our platform policies.
        As a result, you will no longer be able to access our services.
      </p>

      <!-- Alert Box -->
      <div style="background-color:#fef2f2; border-left:4px solid #dc2626; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px; font-weight:600; color:#7f1d1d; font-size:13px;">
          ⚠️ Reason for Restriction
        </p>
        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.6;">
          ${reason}
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        If you believe this restriction is in error or would like to appeal this decision,
        please contact our support team.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- USER RESTRICTION LIFTED EMAIL ---------------- */
function userRestrictionLiftedEmailTemplate({ userName }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Account Restriction Lifted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${userName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Good news! The restriction on your account has been lifted.
        You now have full access to our platform and services again.
      </p>

      <!-- Success Box -->
      <div style="background-color:#f0fdf4; border-left:4px solid #22c55e; padding:16px; margin:24px 0;">
        <p style="margin:0; font-weight:600; color:#166534; font-size:13px;">
          ✅ Account Status: Active
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        We appreciate your patience and cooperation during this review.
        If you have any questions, please don't hesitate to reach out.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- BUSINESS APPROVED EMAIL ---------------- */
function businessApprovalEmailTemplate({ providerName, businessName }) {
  const dashboardURL = `${BASE_URL}/provider/dashboard`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Business Approved</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Header with Celebration -->
    <div style="padding:32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align:center;">
      <h1 style="margin:0; font-size:24px; font-weight:700; color:#ffffff;">
        🎉 Congratulations!
      </h1>
      <p style="margin:8px 0 0; font-size:14px; color:#ffffff; opacity:0.95;">
        Your Business Has Been Approved
      </p>
    </div>

    <!-- Content -->
    <div style="padding:32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        We're excited to inform you that your business <strong>${businessName}</strong>
        has been reviewed and approved by our team.
      </p>

      <!-- Success Box -->
      <div style="background-color:#f0fdf4; border-left:4px solid #22c55e; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px; font-weight:600; color:#166534; font-size:13px;">
          ✅ Business Status: Approved & Published
        </p>
        <p style="margin:0; font-size:13px; color:#15803d;">
          Your business is now visible to customers and ready to receive bookings
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        You can now start managing your business, services, and view bookings from your dashboard.
      </p>

      <!-- CTA -->
      <div style="margin:24px 0; text-align:center;">
        <a
          href="${dashboardURL}"
          style="display:inline-block; padding:12px 24px; background-color:#2563eb; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; border-radius:4px;"
        >
          Go to Dashboard
        </a>
      </div>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- BUSINESS RESTRICTED EMAIL ---------------- */
function businessRestrictionEmailTemplate({
  providerName,
  businessName,
  reason,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Business Restricted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Your business <strong>${businessName}</strong> has been restricted due to
        violations of our platform policies. Your business will no longer be visible to customers.
      </p>

      <!-- Alert Box -->
      <div style="background-color:#fef2f2; border-left:4px solid #dc2626; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px; font-weight:600; color:#7f1d1d; font-size:13px;">
          ⚠️ Reason for Restriction
        </p>
        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.6;">
          ${reason}
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        If you believe this restriction is in error or would like to appeal this decision,
        please contact our support team.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- BUSINESS RESTRICTION LIFTED EMAIL ---------------- */
function businessRestrictionLiftedEmailTemplate({
  providerName,
  businessName,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Business Restriction Lifted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Good news! The restriction on your business <strong>${businessName}</strong>
        has been lifted. Your business is now visible to customers again.
      </p>

      <!-- Success Box -->
      <div style="background-color:#f0fdf4; border-left:4px solid #22c55e; padding:16px; margin:24px 0;">
        <p style="margin:0; font-weight:600; color:#166534; font-size:13px;">
          ✅ Business Status: Active & Published
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        We appreciate your patience and cooperation during this review.
        If you have any questions, please don't hesitate to reach out.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- SERVICE RESTRICTED EMAIL ---------------- */
function serviceRestrictionEmailTemplate({
  providerName,
  businessName,
  serviceName,
  reason,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Service Restricted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Your service <strong>${serviceName}</strong> from <strong>${businessName}</strong>
        has been restricted due to violations of our platform policies.
        This service will no longer be visible to customers.
      </p>

      <!-- Alert Box -->
      <div style="background-color:#fef2f2; border-left:4px solid #dc2626; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px; font-weight:600; color:#7f1d1d; font-size:13px;">
          ⚠️ Reason for Restriction
        </p>
        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.6;">
          ${reason}
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        If you believe this restriction is in error or would like to appeal this decision,
        please contact our support team.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- SERVICE RESTRICTION LIFTED EMAIL ---------------- */
function serviceRestrictionLiftedEmailTemplate({
  providerName,
  businessName,
  serviceName,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Service Restriction Lifted</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        Good news! The restriction on your service <strong>${serviceName}</strong>
        from <strong>${businessName}</strong> has been lifted.
        This service is now visible to customers again.
      </p>

      <!-- Success Box -->
      <div style="background-color:#f0fdf4; border-left:4px solid #22c55e; padding:16px; margin:24px 0;">
        <p style="margin:0; font-weight:600; color:#166534; font-size:13px;">
          ✅ Service Status: Active & Published
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        We appreciate your patience and cooperation during this review.
        If you have any questions, please don't hesitate to reach out.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

/* ---------------- BUSINESS REJECTED EMAIL ---------------- */
function businessRejectionEmailTemplate({
  providerName,
  businessName,
  reason,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Business Rejected</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <div style="max-width:720px; margin:0 auto; background-color:#ffffff;">

    <!-- Logo -->
    <div style="padding:32px 32px 24px;">
      <img
        src="${HSM_LOGO}"
        alt="HSM Logo"
        style="display:block; width:140px; height:auto; object-fit:contain;"
      />
    </div>

    <!-- Content -->
    <div style="padding:24px 32px 32px;">

      <p style="margin:0 0 12px; font-size:14px;">
        Hi <strong>${providerName}</strong>,
      </p>

      <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
        We regret to inform you that your business <strong>${businessName}</strong>
        has been rejected.
      </p>

      <!-- Alert Box -->
      <div style="background-color:#fef2f2; border-left:4px solid #dc2626; padding:16px; margin:24px 0;">
        <p style="margin:0 0 8px; font-weight:600; color:#7f1d1d; font-size:13px;">
          ⚠️ Reason for Rejection
        </p>
        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.6;">
          ${reason}
        </p>
      </div>

      <p style="margin:24px 0 16px; font-size:14px; line-height:1.6;">
        If you have corrected the issues mentioned above or want to appeal, please contact support.
      </p>

      <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
        Regards,<br />
        <strong>Home Service Management Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
      © ${new Date().getFullYear()} Fixora. All rights reserved.
    </div>

  </div>

</body>
</html>
  `;
}

module.exports = {
  userRestrictionEmailTemplate,
  userRestrictionLiftedEmailTemplate,
  businessApprovalEmailTemplate,
  businessRejectionEmailTemplate,
  businessRestrictionEmailTemplate,
  businessRestrictionLiftedEmailTemplate,
  serviceRestrictionEmailTemplate,
  serviceRestrictionLiftedEmailTemplate,
};
