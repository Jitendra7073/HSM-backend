/**
 * HTML Email Templates for Staff Panel
 */

/**
 * Service Completion Email Template for Customer
 */
const serviceCompletionCustomerEmail = (customerName, serviceName, providerName, staffName, bookingDate, bookingId) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Completed</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .booking-details {
      background-color: #f9f9f9;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .booking-details h3 {
      margin: 0 0 15px 0;
      color: #667eea;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eeeeee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555555;
    }
    .detail-value {
      color: #333333;
    }
    .feedback-section {
      background-color: #fff9e6;
      border: 2px dashed #ffa500;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
      text-align: center;
    }
    .feedback-section h3 {
      margin: 0 0 10px 0;
      color: #d35400;
      font-size: 18px;
    }
    .feedback-section p {
      margin: 0;
      color: #666666;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 20px;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
    .rating {
      color: #ffa500;
      font-size: 20px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Service Completed</h1>
    </div>
    <div class="content">
      <div class="greeting">
        Dear ${customerName},
      </div>
      <div class="message">
        Great news! Your service has been successfully completed. Our team member <strong>${staffName}</strong> from <strong>${providerName}</strong> has finished the <strong>${serviceName}</strong> service.
      </div>

      <div class="booking-details">
        <h3>📋 Booking Details</h3>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">#${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Provider:</span>
          <span class="detail-value">${providerName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Staff Member:</span>
          <span class="detail-value">${staffName}</span>
        </div>
      </div>

      <div class="feedback-section">
        <h3>⭐ Your Feedback Matters</h3>
        <div class="rating">★★★★★</div>
        <p>Please take a moment to rate both the staff member and the provider. Your feedback helps us improve our services!</p>
        <a href="${process.env.CLIENT_URL}/customer/feedback/${bookingId}" class="cta-button">Leave Feedback</a>
      </div>

      <div class="message">
        Thank you for choosing our platform. If you have any questions or concerns, please don't hesitate to reach out to our support team.
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Service Completion Email Template for Provider
 */
const serviceCompletionProviderEmail = (providerName, serviceName, staffName, customerName, bookingDate, bookingId, totalAmount, staffPayment) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff Completed Service</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .booking-details {
      background-color: #f9f9f9;
      border-left: 4px solid #11998e;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .booking-details h3 {
      margin: 0 0 15px 0;
      color: #11998e;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eeeeee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555555;
    }
    .detail-value {
      color: #333333;
    }
    .payment-section {
      background-color: #e8f5e9;
      border: 2px solid #4caf50;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .payment-section h3 {
      margin: 0 0 15px 0;
      color: #2e7d32;
      font-size: 18px;
    }
    .payment-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .total-row {
      border-top: 2px solid #4caf50;
      padding-top: 15px;
      margin-top: 10px;
      font-weight: bold;
      font-size: 18px;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 20px;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Service Completed by Staff</h1>
    </div>
    <div class="content">
      <div class="greeting">
        Dear ${providerName},
      </div>
      <div class="message">
        Your staff member <strong>${staffName}</strong> has successfully completed the <strong>${serviceName}</strong> service for customer <strong>${customerName}</strong>.
      </div>

      <div class="booking-details">
        <h3>📋 Booking Details</h3>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">#${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Customer:</span>
          <span class="detail-value">${customerName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Staff Member:</span>
          <span class="detail-value">${staffName}</span>
        </div>
      </div>

      <div class="payment-section">
        <h3>💰 Payment Breakdown</h3>
        <div class="payment-row">
          <span class="detail-label">Total Amount:</span>
          <span class="detail-value">₹${totalAmount}</span>
        </div>
        <div class="payment-row">
          <span class="detail-label">Platform Fee:</span>
          <span class="detail-value">₹${(totalAmount * 0.1).toFixed(2)}</span>
        </div>
        <div class="payment-row">
          <span class="detail-label">Your Earnings:</span>
          <span class="detail-value">₹${(totalAmount * 0.9).toFixed(2)}</span>
        </div>
        <div class="payment-row total-row">
          <span>Staff Payment (${staffPayment.percentage}%):</span>
          <span>₹${staffPayment.amount}</span>
        </div>
        <div class="payment-row total-row">
          <span>Your Net Earnings:</span>
          <span>₹${(totalAmount * 0.9 - staffPayment.amount).toFixed(2)}</span>
        </div>
      </div>

      <div class="message">
        The staff payment has been processed automatically. Please review the payment details and let us know if you have any questions.
      </div>

      <a href="${process.env.CLIENT_URL}/provider/bookings/${bookingId}" class="cta-button">View Booking Details</a>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Staff Payment Confirmation Email
 */
const staffPaymentConfirmationEmail = (staffName, serviceName, providerName, amount, bookingDate, bookingId) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .payment-amount {
      font-size: 48px;
      font-weight: bold;
      color: #f5576c;
      text-align: center;
      margin: 30px 0;
    }
    .payment-details {
      background-color: #fff5f5;
      border-left: 4px solid #f5576c;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .payment-details h3 {
      margin: 0 0 15px 0;
      color: #f5576c;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eeeeee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💵 Payment Received</h1>
    </div>
    <div class="content">
      <div class="greeting">
        Congratulations, ${staffName}!
      </div>
      <div class="message">
        You have received a payment for completing the <strong>${serviceName}</strong> service for <strong>${providerName}</strong>.
      </div>

      <div class="payment-amount">
        ₹${amount}
      </div>

      <div class="payment-details">
        <h3>💳 Payment Details</h3>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">#${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Service Date:</span>
          <span class="detail-value">${bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Provider:</span>
          <span class="detail-value">${providerName}</span>
        </div>
      </div>

      <div class="message">
        Thank you for your excellent work! Keep up the great service. This payment has been added to your total earnings.
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Payment Request Email to Provider
 */
const paymentRequestProviderEmail = (staffName, serviceName, requestedAmount, staffFeedback, bookingDate, bookingId, slotTime, requestId) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Payment Request</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .request-details {
      background-color: #fff9e6;
      border-left: 4px solid #ffa500;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .request-details h3 {
      margin: 0 0 15px 0;
      color: #d35400;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eeeeee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555555;
    }
    .detail-value {
      color: #333333;
    }
    .feedback-section {
      background-color: #f0f8ff;
      border: 1px solid #4a90a4;
      padding: 15px;
      margin: 20px 0;
      border-radius: 6px;
      font-style: italic;
      color: #555555;
    }
    .feedback-section strong {
      color: #333333;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 10px;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 New Payment Request</h1>
    </div>
    <div class="content">
      <div class="greeting">
        Dear Provider,
      </div>
      <div class="message">
        Your staff member <strong>${staffName}</strong> has requested payment for completing the <strong>${serviceName}</strong> service. Please review the details and approve the payment at your earliest convenience.
      </div>

      <div class="request-details">
        <h3>📋 Request Details</h3>
        <div class="detail-row">
          <span class="detail-label">Staff Member:</span>
          <span class="detail-value">${staffName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">#${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time:</span>
          <span class="detail-value">${slotTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Requested Amount:</span>
          <span class="detail-value"><strong>₹${requestedAmount}</strong></span>
        </div>
      </div>

      ${staffFeedback ? `<div class="feedback-section">
        <strong>Staff Feedback:</strong> "${staffFeedback}"
      </div>` : ''}

      <a href="${process.env.CLIENT_URL}/provider/payments/review/${requestId}" class="cta-button">Review & Approve Payment</a>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Staff Payment Received Email (With Invoice)
 */
const staffPaymentReceivedEmail = (staffName, serviceName, staffAmount, percentage, providerEarnings, transferId, paymentDate, bookingId, providerName) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received - Invoice</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 700px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .invoice-header {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 25px;
      border-left: 4px solid #4caf50;
    }
    .invoice-number {
      font-size: 14px;
      color: #666;
      margin-bottom: 5px;
    }
    .invoice-id {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .payment-amount {
      font-size: 48px;
      font-weight: bold;
      color: #11998e;
      text-align: center;
      margin: 30px 0;
    }
    .payment-details {
      background-color: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 25px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .payment-details h3 {
      margin: 0 0 20px 0;
      color: #2e7d32;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555555;
    }
    .detail-value {
      color: #333333;
      font-weight: 500;
    }
    .total-row {
      background-color: #2e7d32;
      color: white;
      margin: 20px -25px -25px -25px;
      padding: 15px 25px;
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
    }
    .total-row .detail-label,
    .total-row .detail-value {
      color: white;
      font-size: 18px;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
    .success-icon {
      text-align: center;
      font-size: 60px;
      margin: 20px 0;
    }
    .info-box {
      background-color: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 14px;
      color: #1565c0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💵 Payment Received - Invoice</h1>
    </div>
    <div class="content">
      <div class="success-icon">✅</div>

      <div class="invoice-header">
        <div class="invoice-number">PAYMENT INVOICE</div>
        <div class="invoice-id">Invoice #INV-${transferId?.slice(0, 8).toUpperCase() || transferId}</div>
        <div class="invoice-number">Date: ${paymentDate}</div>
      </div>

      <div class="greeting">
        Great news, ${staffName}!
      </div>
      <div class="message">
        Your payment request has been approved by <strong>${providerName || "Provider"}</strong>. The amount has been transferred to your account.
      </div>

      <div class="payment-amount">
        ₹${staffAmount}
      </div>

      <div class="payment-details">
        <h3>💳 Payment Invoice</h3>
        <div class="detail-row">
          <span class="detail-label">Service Provided:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">#${bookingId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Provider Earnings:</span>
          <span class="detail-value">₹${providerEarnings}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Your Share:</span>
          <span class="detail-value">${percentage}%</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Transfer ID:</span>
          <span class="detail-value">${transferId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Date:</span>
          <span class="detail-value">${paymentDate}</span>
        </div>
        <div class="total-row detail-row">
          <span class="detail-label">Total Amount Received:</span>
          <span class="detail-value">₹${staffAmount}</span>
        </div>
      </div>

      <div class="info-box">
        <strong>Important:</strong> This payment will appear in your connected bank account within 2-3 business days, depending on your bank's processing time.
      </div>

      <div class="message">
        Thank you for your excellent work! Keep providing great service to our customers.
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
      <p>For any queries, contact our support team.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Payment Request Rejected Email
 */
const paymentRequestRejectedEmail = (staffName, serviceName, rejectionReason) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Request Rejected</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #555555;
      line-height: 1.6;
      margin-bottom: 25px;
    }
    .rejection-details {
      background-color: #fff5f5;
      border-left: 4px solid #f45c43;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .rejection-details h3 {
      margin: 0 0 15px 0;
      color: #c0392b;
      font-size: 18px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eeeeee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555555;
    }
    .detail-value {
      color: #333333;
    }
    .reason-section {
      background-color: #ffebee;
      border: 1px solid #ef5350;
      padding: 15px;
      margin: 20px 0;
      border-radius: 6px;
    }
    .reason-section strong {
      color: #c0392b;
    }
    .reason-section p {
      margin: 10px 0 0 0;
      color: #555555;
      font-style: italic;
    }
    .footer {
      background-color: #f4f4f4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888888;
    }
    .rejected-icon {
      text-align: center;
      font-size: 60px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Payment Request Rejected</h1>
    </div>
    <div class="content">
      <div class="rejected-icon">🚫</div>
      <div class="greeting">
        Dear ${staffName},
      </div>
      <div class="message">
        We regret to inform you that your payment request for <strong>${serviceName}</strong> has been rejected by the provider.
      </div>

      <div class="rejection-details">
        <h3>📋 Request Details</h3>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${serviceName}</span>
        </div>
      </div>

      <div class="reason-section">
        <strong>Reason for Rejection:</strong>
        <p>"${rejectionReason}"</p>
      </div>

      <div class="message">
        If you believe this rejection is in error, please contact your provider directly to discuss the matter. For any platform-related concerns, feel free to reach out to our support team.
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Home Service Platform. All rights reserved.</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = {
  serviceCompletionCustomerEmail,
  serviceCompletionProviderEmail,
  staffPaymentConfirmationEmail,
  paymentRequestProviderEmail,
  staffPaymentReceivedEmail,
  paymentRequestRejectedEmail,
};
