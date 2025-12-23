/* ---------------- WELCOME USER ---------------- */
function welcomeUserTamplate(userName) {
  return `

          <table role="presentation" class="container" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border-collapse: collapse; overflow: hidden;">
            
            <!-- Header -->
            <tr>
              <td class="header" style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 28px 24px; text-align: center; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                Welcome Aboard!
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td class="content" style="padding: 32px 28px;">
                
                <!-- Greeting -->
                <p style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50; font-weight: 600;">
                  Hi ${userName},
                </p>
                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #546e7a;">
                  Thank you for joining us! We're thrilled to have you on board. Your account is now active and ready to use.
                </p>

                <!-- Additional Info -->
                <p style="margin-top: 28px; font-size: 13px; line-height: 1.6; color: #546e7a;">
                  If you have any questions or need help getting started, our support team is always available to assist you.
                </p>

                <!-- Footer -->
                <p class="footer-text" style="margin-top: 28px; font-size: 12px; color: #90a4ae; text-align: center; line-height: 1.6;">
                  <a href="mailto:support@example.com" style="color: #2a5298; text-decoration: none; font-weight: 600;">Contact Support</a> • 
                  <a href="#" style="color: #2a5298; text-decoration: none; font-weight: 600;">Help Center</a>
                </p>
              </td>
            </tr>
            
            <!-- Footer Divider -->
            <tr>
              <td style="height: 1px; background-color: #eceff1;"></td>
            </tr>
            
            <!-- Branding Footer -->
            <tr>
              <td style="padding: 16px 28px; text-align: center; background-color: #fafbfc;">
                <p style="margin: 0; font-size: 12px; color: #90a4ae;">
                  © 2024 HSM. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
  `;
}

/* ---------------- FORGOT PASSWORD ---------------- */
const forgotPasswordTamplate = (name, token) => {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background:#f7f7f7; padding:20px;">
  <tr>
    <td>
      <table cellpadding="0" cellspacing="0" width="600" align="center" style="background:#ffffff; border-radius:8px; padding:30px;">
        <tr>
          <td>
            <h2 style="color:#333;">Hello ${name},</h2>

            <p style="font-size:16px; color:#555;">
              You requested to reset your password.  
              Click the button below to proceed:
            </p>

            <a href="http://localhost:3000/auth/reset-password/${token}"
              style="display:inline-block; margin:20px 0; background:#007bff; color:#fff; padding:12px 20px; text-decoration:none; border-radius:5px;">
              Reset Password
            </a>

            <p style="font-size:14px; color:#777;">
              If you did not request this, please ignore this email.
            </p>

            <p style="margin-top:30px; font-size:14px; color:#777;">
              Best Regards,<br/>
              <strong>Home Service Management Team</strong>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `;
};

/* ---------------- BOOKING SUCCESS ---------------- */
function bookingSuccessEmailTemplate({
  userName,
  bookingIds,
  totalAmount,
  paymentId,
  paymentDate,
  customerPortalUrl,
  services,
  businessName,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmed</title>
    <style type="text/css">
      @media only screen and (max-width: 600px) {
        .container { width: 100% !important; }
        .header { padding: 16px !important; font-size: 20px !important; }
        .content { padding: 18px !important; }
        .cta-button { width: 100% !important; padding: 14px !important; box-sizing: border-box !important; }
        .footer-text { font-size: 11px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
    
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0f2f5;">
      <tr>
        <td style="padding: 30px 16px;">
          
          <!-- Main Container -->
          <table role="presentation" class="container" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border-collapse: collapse; overflow: hidden;">
            
            <!-- Header -->
            <tr>
              <td class="header" style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 28px 24px; text-align: center; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                ✓ Booking Confirmed
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td class="content" style="padding: 32px 28px;">
                
                <!-- Greeting -->
                <p style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50; font-weight: 600;">
                  Hi ${userName},
                </p>
                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #546e7a;">
                  Your booking has been successfully confirmed! We've received your payment and your appointment is all set.
                </p>

                <!-- Quick Summary -->
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; font-size: 13px; color: #90a4ae;">Booking Reference</td>
                      <td style="text-align: right; padding: 8px 0; font-size: 12px; font-weight: 600; color: #2c3e50; font-family: 'Courier New', monospace;">${bookingIds[0]}</td>
                    </tr>
                    <tr style="border-top: 1px solid #e0e0e0;">
                      <td style="padding: 12px 0; font-size: 13px; color: #90a4ae;">Total Amount</td>
                      <td style="text-align: right; padding: 12px 0; font-size: 18px; font-weight: 700; color: #1e3c72;">₹${totalAmount}</td>
                    </tr>
                  </table>
                </div>

                <!-- Information Text -->
                <p style="margin: 24px 0; font-size: 14px; line-height: 1.6; color: #546e7a;">
                  A detailed invoice and booking confirmation have been attached to this email. Please keep them safe for your records.
                </p>

                <!-- Support Text -->
                <p class="footer-text" style="margin-top: 32px; font-size: 12px; color: #90a4ae; text-align: center; line-height: 1.6;">
                  Need assistance? Our support team is here to help.<br/>
                  <a href="mailto:hsm@supportEmail.com" style="color: #2a5298; text-decoration: none; font-weight: 600;">Contact Support</a>
                </p>
              </td>
            </tr>
            
            <!-- Footer Divider -->
            <tr>
              <td style="height: 1px; background-color: #eceff1;"></td>
            </tr>
            
            <!-- Branding Footer -->
            <tr>
              <td style="padding: 16px 28px; text-align: center; background-color: #fafbfc;">
                <p style="margin: 0; font-size: 12px; color: #90a4ae;">
                  © 2024 ${businessName}. All rights reserved.
                </p>
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

/* ---------------- BOOKING FAILED ---------------- */
function bookingFailedEmailTemplate({
  userName,
  services,
  businessName,
  customerPortalUrl,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Failed</title>
    <style type="text/css">
      @media only screen and (max-width: 600px) {
        .container { width: 100% !important; }
        .header { padding: 16px !important; font-size: 20px !important; }
        .content { padding: 18px !important; }
        .service-item { font-size: 13px !important; padding: 8px 0 !important; }
        .cta-button { width: 100% !important; padding: 14px !important; box-sizing: border-box !important; }
        .footer-text { font-size: 11px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f2f5;">
    
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0f2f5;">
      <tr>
        <td style="padding: 30px 16px;">
          
          <!-- Main Container -->
          <table role="presentation" class="container" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border-collapse: collapse; overflow: hidden;">
            
            <!-- Header -->
            <tr>
              <td class="header" style="background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%); padding: 28px 24px; text-align: center; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                ✕ Payment Failed
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td class="content" style="padding: 32px 28px;">
                
                <!-- Greeting -->
                <p style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50; font-weight: 600;">
                  Hi ${userName},
                </p>
                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #546e7a;">
                  Unfortunately, we weren't able to process your payment. Your booking was not completed.
                </p>

                <!-- Alert Box -->
                <div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 16px; border-radius: 4px; margin: 24px 0;">
                  <p style="margin: 0; font-size: 13px; color: #c62828; font-weight: 500;">
                    Please try again or use a different payment method.
                  </p>
                </div>

                <!-- Services Attempted -->
                <h3 style="margin: 24px 0 14px 0; font-size: 17px; color: #1e3c72; font-weight: 700;">
                  Services Attempted
                </h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; padding: 16px; border-radius: 6px;">
                  ${services
                    .map(
                      (s) => `
                    <tr class="service-item">
                      <td style="padding: 8px 0; font-size: 14px; color: #546e7a;">${s.name}</td>
                      <td style="text-align: right; padding: 8px 0; font-size: 14px; color: #2c3e50; font-weight: 600;">₹${s.price}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </table>

                <p style="margin-top: 14px; font-size: 14px; color: #546e7a;">
                  <strong style="color: #2c3e50;">Service Provider:</strong> ${businessName}
                </p>

                <!-- CTA Button -->
                <div style="text-align: center; margin-top: 32px;">
                  <a href="${customerPortalUrl}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%); color: white; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; text-decoration: none; border: none; cursor: pointer;">
                    Retry Payment →
                  </a>
                </div>

                <!-- Support Section -->
                <div style="background-color: #f8f9fa; padding: 16px; border-radius: 6px; margin-top: 28px;">
                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #90a4ae; font-weight: 600;">HAVING ISSUES?</p>
                  <p style="margin: 0; font-size: 13px; color: #546e7a; line-height: 1.6;">
                    If the issue persists, please reach out to our support team and we'll help you resolve it.
                  </p>
                </div>

                <!-- Footer -->
                <p class="footer-text" style="margin-top: 28px; font-size: 12px; color: #90a4ae; text-align: center; line-height: 1.6;">
                  <a href="mailto:support@example.com" style="color: #d32f2f; text-decoration: none; font-weight: 600;">Contact Support</a>
                </p>
              </td>
            </tr>
            
            <!-- Footer Divider -->
            <tr>
              <td style="height: 1px; background-color: #eceff1;"></td>
            </tr>
            
            <!-- Branding Footer -->
            <tr>
              <td style="padding: 16px 28px; text-align: center; background-color: #fafbfc;">
                <p style="margin: 0; font-size: 12px; color: #90a4ae;">
                  © 2024 ${businessName}. All rights reserved.
                </p>
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

function providerSubscriptionSuccessEmailTemplate({
  providerName,
  businessName,
  planName,
  planAmount,
  subscriptionId,
  subscriptionStart,
  subscriptionEnd,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Subscription Activated</title>
    <style type="text/css">
      @media only screen and (max-width: 600px) {
        .container { width: 100% !important; }
        .header { padding: 16px !important; font-size: 20px !important; }
        .content { padding: 18px !important; }
        .cta-button {
          width: 100% !important;
          padding: 14px !important;
          box-sizing: border-box !important;
        }
        .footer-text { font-size: 11px !important; }
      }
    </style>
  </head>

  <body style="margin:0; padding:0; font-family:'Segoe UI', Roboto, Arial, sans-serif; background-color:#f0f2f5;">
    <table role="presentation" style="width:100%; background-color:#f0f2f5; border-collapse:collapse;">
      <tr>
        <td style="padding:30px 16px;">
          
          <!-- Main Container -->
          <table role="presentation" class="container"
            style="width:100%; max-width:600px; margin:0 auto; background:#ffffff;
            border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">

            <!-- Header -->
            <tr>
              <td class="header"
                style="background:linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%);
                padding:28px 24px; text-align:center; color:#ffffff;
                font-size:24px; font-weight:700;">
                🎉 Subscription Activated
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td class="content" style="padding:32px 28px;">

                <!-- Greeting -->
                <p style="margin:0 0 8px; font-size:16px; color:#2c3e50; font-weight:600;">
                  Hi ${providerName},
                </p>

                <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#546e7a;">
                  Thank you for subscribing to <strong>${planName}</strong>.
                  Your subscription has been successfully activated for
                  <strong>${businessName}</strong>.
                </p>

                <!-- Subscription Summary -->
                <div style="background:#f8f9fa; padding:20px; border-radius:6px; margin:24px 0;">
                  <table role="presentation" style="width:100%; border-collapse:collapse;">

                    <tr>
                      <td style="padding:8px 0; font-size:13px; color:#90a4ae;">Plan</td>
                      <td style="text-align:right; padding:8px 0; font-size:13px; font-weight:600; color:#2c3e50;">
                        ${planName}
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:8px 0; font-size:13px; color:#90a4ae;">Subscription ID</td>
                      <td style="text-align:right; padding:8px 0; font-size:12px; font-family:'Courier New', monospace; color:#2c3e50;">
                        ${subscriptionId}
                      </td>
                    </tr>

                    <tr style="border-top:1px solid #e0e0e0;">
                      <td style="padding:12px 0; font-size:13px; color:#90a4ae;">Amount Paid</td>
                      <td style="text-align:right; padding:12px 0; font-size:18px; font-weight:700; color:#0f2027;">
                        ₹${planAmount}
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:8px 0; font-size:13px; color:#90a4ae;">Billing Period</td>
                      <td style="text-align:right; padding:8px 0; font-size:13px; font-weight:600; color:#2c3e50;">
                        ${subscriptionStart} → ${subscriptionEnd}
                      </td>
                    </tr>

                  </table>
                </div>

                <!-- Invoice Info -->
                <p style="margin:24px 0; font-size:14px; line-height:1.6; color:#546e7a;">
                  Your invoice has been attached to this email for your records.
                  You can also view your subscription history and invoices anytime from your billing portal.
                </p>

                <!-- CTA -->
                <div style="text-align:center; margin:32px 0;">
                  <a href="http://localhost:3000/provider/dashboard/pricing"
                    class="cta-button"
                    style="display:inline-block; background:#2c5364; color:#ffffff;
                    padding:14px 28px; border-radius:6px; text-decoration:none;
                    font-size:14px; font-weight:600;">
                    View Billing & Invoices
                  </a>
                </div>

                <!-- Support -->
                <p class="footer-text" style="margin-top:32px; font-size:12px; color:#90a4ae; text-align:center; line-height:1.6;">
                  Have questions about your subscription?<br />
                  <a href="mailto:support@hsmgmail.com"
                    style="color:#2c5364; text-decoration:none; font-weight:600;">
                    Contact Provider Support
                  </a>
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="height:1px; background:#eceff1;"></td>
            </tr>

            <tr>
              <td style="padding:16px 28px; text-align:center; background:#fafbfc;">
                <p style="margin:0; font-size:12px; color:#90a4ae;">
                  © ${new Date().getFullYear()} ${businessName}. All rights reserved.
                </p>
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
  providerSubscriptionSuccessEmailTemplate
};
