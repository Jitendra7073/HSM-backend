const crypto = require("crypto");

// Encryption configuration
const ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

/**
 * Encrypt sensitive data (card numbers, CVV)
 * @param {string} text - Plain text to encrypt
 * @returns {object} - Encrypted data with IV and auth tag
 */
function encrypt(text) {
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );

    // Encrypt the text
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt sensitive data");
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data
 * @param {string} iv - Initialization vector
 * @param {string} authTag - Authentication tag
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedData, iv, authTag) {
  try {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "hex"),
      Buffer.from(iv, "hex")
    );

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    // Decrypt the data
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt sensitive data");
  }
}

/**
 * Mask card number for display (show first 6 and last 4 digits)
 * @param {string} cardNumber - Full card number
 * @returns {string} - Masked card number
 */
function maskCardNumber(cardNumber) {
  if (!cardNumber || cardNumber.length < 13) {
    return "•••• •••• ••••";
  }

  const firstSix = cardNumber.substring(0, 6);
  const lastFour = cardNumber.substring(cardNumber.length - 4);
  const middleLength = cardNumber.length - 10;

  return `${firstSix}${"*".repeat(middleLength)}${lastFour}`;
}

/**
 * Validate card number using Luhn algorithm
 * @param {string} cardNumber - Card number to validate
 * @returns {boolean} - Is valid card number
 */
function validateCardNumber(cardNumber) {
  // Remove spaces and dashes
  const cleaned = cardNumber.replace(/[\s-]/g, "");

  // Check if it's a number and has valid length
  if (!/^\d{13,19}$/.test(cleaned)) {
    return false;
  }

  // Luhn algorithm
  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned.charAt(i), 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Detect card type from card number
 * @param {string} cardNumber - Card number
 * @returns {string} - Card type (visa, mastercard, amex, discover, rupay, unknown)
 */
function detectCardType(cardNumber) {
  const cleaned = cardNumber.replace(/[\s-]/g, "");

  // Visa: starts with 4
  if (/^4/.test(cleaned)) {
    return "visa";
  }

  // Mastercard: starts with 51-55 or 2221-2720
  if (/^5[1-5]/.test(cleaned) || /^2[2-7][2-2][0-1]/.test(cleaned)) {
    return "mastercard";
  }

  // American Express: starts with 34 or 37
  if (/^3[47]/.test(cleaned)) {
    return "amex";
  }

  // Discover: starts with 6011, 622126-622925, 644-649, 65
  if (/^6011|^65\d{2}/.test(cleaned) || /^6[4-9]\d{2}/.test(cleaned)) {
    return "discover";
  }

  // RuPay: starts with 60, 65, 81, 82, 508, 353, 356
  if (/^(60|65|81|82|508|353|356)/.test(cleaned)) {
    return "rupay";
  }

  return "unknown";
}

/**
 * Check if card is expired
 * @param {number} month - Expiry month (1-12)
 * @param {number} year - Expiry year
 * @returns {boolean} - Is card expired
 */
function isCardExpired(month, year) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) {
    return true;
  }

  if (year === currentYear && month < currentMonth) {
    return true;
  }

  return false;
}

module.exports = {
  encrypt,
  decrypt,
  maskCardNumber,
  validateCardNumber,
  detectCardType,
  isCardExpired,
};
