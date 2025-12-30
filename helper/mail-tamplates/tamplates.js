const BASE_URL = process.env.CLIENT_URL;
const HSM_LOGO =
  "https://res.cloudinary.com/dotm2ownb/image/upload/v1767090471/HSM-logo_mvqexc.png";

/* ---------------- WELCOME USER ---------------- */
function welcomeUserTamplate(userName) {
  const ExploreServicesURL = `${BASE_URL}/customer/explore`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Welcome to HSM</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background-color:#ffffff;
    font-family:Arial, Helvetica, sans-serif;
    color:#1f2937;
  "
>

  <!-- Main Content -->
  <main style="padding:32px; max-width:720px;">

    <!-- Logo -->
    <img
      src="${HSM_LOGO}"
      alt="HSM Logo"
      style="
        display:block;
        width:140px;
        height:auto;
        margin-bottom:16px;
        object-fit:contain;
      "
    />

    <!-- Greeting -->
    <p style="margin:0 0 12px 0; font-size:14px;">
      Hi <strong>${userName}</strong>,
    </p>

    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6;">
      Welcome to <strong>HSM</strong>. Your account has been successfully created.
      You can now book verified professionals for home services such as repairs,
      maintenance, and cleaning.
    </p>

    <p style="margin:0 0 24px 0; font-size:14px; line-height:1.6;">
      To get started, explore available services or manage your profile.
    </p>

    <!-- CTA -->
    <p style="margin:24px 0;">
      <a
        href="${ExploreServicesURL}"
        style="
          display:inline-block;
          padding:10px 16px;
          background-color:#2563eb;
          color:#ffffff;
          text-decoration:none;
          font-size:14px;
          font-weight:600;
          border-radius:4px;
        "
      >
        Explore Services
      </a>
    </p>

    <p style="margin:32px 0 8px 0; font-size:13px; color:#4b5563;">
      If you need any assistance, feel free to contact our support team.
    </p>

    <p style="margin:0; font-size:13px;">
      <a
        href="mailto:hsm@support.com"
        style="color:#2563eb; text-decoration:none;"
      >
        hsm@support.com
      </a>
    </p>

  </main>

  <!-- Footer -->
  <footer
    style="
      padding:24px 32px;
      border-top:1px solid #e5e7eb;
      font-size:12px;
      color:#6b7280;
    "
  >
    © ${new Date().getFullYear()} HSM. All rights reserved.
  </footer>

</body>
</html>

  `;
}

/* ---------------- FORGOT PASSWORD ---------------- */
const forgotPasswordTamplate = (name, token) => {
  const resetUrl = `${BASE_URL}/auth/reset-password?token=${token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Password Reset</title>
</head>

<body style="margin:0; padding:0; background-color:#ffffff; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

  <!-- Main Content -->
  <main style="padding:32px; max-width:720px;">
  <!-- Logo -->
    <img
      src="${HSM_LOGO}"
      alt="HSM Logo"
      style="
        display:block;
        width:140px;
        height:auto;
        margin-bottom:16px;
        object-fit:contain;
      "
    />
    <p style="margin:0 0 12px 0; font-size:14px;">
      Hello <strong>${name}</strong>,
    </p>

    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6;">
      We received a request to reset the password for your HSM account.
      If you initiated this request, you can reset your password using the link below.
    </p>

    <!-- CTA -->
    <p style="margin:24px 0;">
      <a href="${resetUrl}"
         style="display:inline-block; padding:10px 16px;
         background-color:#2563eb; color:#ffffff;
         text-decoration:none; font-size:14px; font-weight:600; border-radius:4px;">
        Reset Password
      </a>
    </p>

    <p style="margin:24px 0 16px 0; font-size:13px; color:#4b5563; line-height:1.6;">
      This password reset link is valid for a limited time.
      If you did not request a password reset, please ignore this email.
      Your account will remain secure.
    </p>

    <p style="margin:32px 0 0 0; font-size:13px; color:#4b5563;">
      Regards,<br />
      <strong>Home Service Management Team</strong>
    </p>
  </main>

  <!-- Footer -->
  <footer style="padding:24px 32px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
    © ${new Date().getFullYear()} HSM. All rights reserved.
  </footer>

</body>
</html>
  `;
};

/* ---------------- BOOKING SUCCESS EMAIL ---------------- */
function bookingSuccessEmailTemplate({
  userName,
  bookingIds,
  totalAmount,
  paymentId,
  paymentDate,
  services,
  businessName,
}) {
  const formattedDate = new Date(paymentDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Booking Confirmed</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

<!-- Logo -->
    <img
      src="${HSM_LOGO}"
      alt="HSM Logo"
      style="
        display:block;
        width:140px;
        height:auto;
        margin-bottom:16px;
        object-fit:contain;
      "
    />
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;">
    <tr>
      <td style="padding:24px;">

        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:720px; margin:0 auto; background-color:#ffffff; border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #e5e7eb;">
              <h1 style="margin:0; font-size:18px; font-weight:600;">
                ${businessName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:24px; font-size:14px; line-height:1.6;">

              <p style="margin:0 0 12px;">
                Hi <strong>${userName}</strong>,
              </p>

              <p style="margin:0 0 16px;">
                Your booking has been successfully confirmed. We’ve received your payment
                and your service request is scheduled as per the details below.
              </p>

              <!-- Booking Summary -->
              <h3 style="margin:24px 0 12px; font-size:15px; font-weight:600;">
                Booking Summary
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse; font-size:13px;">
                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Booking ID(s)</td>
                  <td style="padding:8px 0; text-align:right; font-family:monospace;">
                    ${bookingIds.join(", ")}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Payment ID</td>
                  <td style="padding:8px 0; text-align:right;">
                    ${paymentId}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Payment Date</td>
                  <td style="padding:8px 0; text-align:right;">
                    ${formattedDate}
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 0; color:#6b7280; border-top:1px solid #e5e7eb;">
                    Total Amount Paid
                  </td>
                  <td style="padding:12px 0; text-align:right; font-size:15px; font-weight:600; border-top:1px solid #e5e7eb;">
                    ₹${totalAmount}
                  </td>
                </tr>
              </table>

              <!-- Services Details -->
              <h3 style="margin:28px 0 12px; font-size:15px; font-weight:600;">
                Services Booked
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Service</th>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Date</th>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Time</th>
                    <th align="right" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${services
                    .map(
                      (service) => `
                      <tr>
                        <td style="padding:8px 0;">${service.title}</td>
                        <td style="padding:8px 0;">${service.bookingDate}</td>
                        <td style="padding:8px 0;">${service.slotTime}</td>
                        <td style="padding:8px 0; text-align:right;">₹${service.price}</td>
                      </tr>
                    `
                    )
                    .join("")}
                </tbody>
              </table>

              <!-- Invoice Note -->
              <p style="margin:24px 0 0; font-size:13px; color:#4b5563;">
                A detailed invoice for your booking is attached with this email for your reference.
              </p>

              <!-- Support -->
              <p style="margin:24px 0 0; font-size:13px; color:#4b5563;">
                If you have any questions or need assistance, please contact our support team.
              </p>

              <p style="margin:6px 0 0; font-size:13px;">
                <a href="mailto:hsm@supportEmail.com" style="color:#2563eb; text-decoration:none;">
                  hsm@supportEmail.com
                </a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
              © ${new Date().getFullYear()} ${businessName}. All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

/* ---------------- BOOKING FAILED EMAIL ---------------- */
function bookingFailedEmailTemplate({ userName, services, businessName }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Payment Failed</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

<!-- Logo -->
    <img
      src="${HSM_LOGO}"
      alt="HSM Logo"
      style="
        display:block;
        width:140px;
        height:auto;
        margin-bottom:16px;
        object-fit:contain;
      "
    />
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;">
    <tr>
      <td style="padding:24px;">

        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:720px; margin:0 auto; background-color:#ffffff; border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #e5e7eb;">
              <h1 style="margin:0; font-size:18px; font-weight:600;">
                ${businessName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:24px; font-size:14px; line-height:1.6;">

              <p style="margin:0 0 12px;">
                Hi <strong>${userName}</strong>,
              </p>

              <p style="margin:0 0 16px;">
                We were unable to process your payment, and your booking could not be completed.
                No amount has been charged.
              </p>

              <!-- Alert -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin:16px 0; background-color:#fef2f2; border-left:4px solid #dc2626;">
                <tr>
                  <td style="padding:12px; font-size:13px; color:#7f1d1d;">
                    Please retry the payment or use a different payment method.
                  </td>
                </tr>
              </table>

              <!-- Services Attempted -->
              <h3 style="margin:24px 0 12px; font-size:15px; font-weight:600;">
                Services Attempted
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Service</th>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Date</th>
                    <th align="left" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Time</th>
                    <th align="right" style="padding:8px 0; border-bottom:1px solid #e5e7eb;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${services
                    .map(
                      (service) => `
                      <tr>
                        <td style="padding:8px 0;">${service.title}</td>
                        <td style="padding:8px 0;">${service.bookingDate}</td>
                        <td style="padding:8px 0;">${service.slotTime}</td>
                        <td style="padding:8px 0; text-align:right;">₹${service.price}</td>
                      </tr>
                    `
                    )
                    .join("")}
                </tbody>
              </table>

              <p style="margin:16px 0 0; font-size:13px; color:#4b5563;">
                <strong>Service Provider:</strong> ${businessName}
              </p>

              <!-- Support -->
              <p style="margin:24px 0 0; font-size:13px; color:#4b5563;">
                If the issue persists, please contact our support team for assistance.
              </p>

              <p style="margin:6px 0 0; font-size:13px;">
                <a href="mailto:hsm@supportEmail.com" style="color:#2563eb; text-decoration:none;">
                  hsm@supportEmail.com
                </a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
              © ${new Date().getFullYear()} ${businessName}. All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

/* ---------------- PROVIDER SUBSCRIPTION SUCCESS ---------------- */
function providerSubscriptionSuccessEmailTemplate({
  providerName,
  businessName,
  planName,
  planAmount,
  subscriptionId,
  subscriptionStart,
  subscriptionEnd,
}) {
  const subStart = new Date(subscriptionStart).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const subEnd = new Date(subscriptionEnd).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Subscription Activated</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif; color:#1f2937;">

<!-- Logo -->
    <img
      src="${HSM_LOGO}"
      alt="HSM Logo"
      style="
        display:block;
        width:140px;
        height:auto;
        margin-bottom:16px;
        object-fit:contain;
      "
    />
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;">
    <tr>
      <td style="padding:24px;">

        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:720px; margin:0 auto; background-color:#ffffff; border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px; border-bottom:1px solid #e5e7eb;">
              <h1 style="margin:0; font-size:18px; font-weight:600;">
                ${businessName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:24px; font-size:14px; line-height:1.6;">

              <p style="margin:0 0 12px;">
                Hi <strong>${providerName}</strong>,
              </p>

              <p style="margin:0 0 16px;">
                Your subscription has been successfully activated.
                The <strong>${planName}</strong> plan is now active for your business.
              </p>

              <!-- Subscription Summary -->
              <h3 style="margin:24px 0 12px; font-size:15px; font-weight:600;">
                Subscription Details
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse; font-size:13px;">
                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Plan Name</td>
                  <td style="padding:8px 0; text-align:right; font-weight:600;">
                    ${planName}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Subscription ID</td>
                  <td style="padding:8px 0; text-align:right; font-family:monospace;">
                    ${subscriptionId}
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Billing Period</td>
                  <td style="padding:8px 0; text-align:right;">
                    ${subStart} – ${subEnd}
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 0; color:#6b7280; border-top:1px solid #e5e7eb;">
                    Amount Paid
                  </td>
                  <td style="padding:12px 0; text-align:right; font-size:15px; font-weight:600; border-top:1px solid #e5e7eb;">
                    ₹${planAmount}
                  </td>
                </tr>
              </table>

              <!-- Invoice Note -->
              <p style="margin:24px 0 0; font-size:13px; color:#4b5563;">
                An invoice for this subscription has been attached to this email for your records.
                You can access all your invoices and billing history from your provider dashboard.
              </p>

              <!-- Support -->
              <p style="margin:24px 0 0; font-size:13px; color:#4b5563;">
                If you have questions about your subscription or billing,
                please contact provider support.
              </p>

              <p style="margin:6px 0 0; font-size:13px;">
                <a href="mailto:support@hsmgmail.com"
                   style="color:#2563eb; text-decoration:none;">
                  support@hsmgmail.com
                </a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
              © ${new Date().getFullYear()} ${businessName}. All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

module.exports = {
  welcomeUserTamplate,
  forgotPasswordTamplate,
  bookingSuccessEmailTemplate,
  bookingFailedEmailTemplate,
  providerSubscriptionSuccessEmailTemplate,
};
