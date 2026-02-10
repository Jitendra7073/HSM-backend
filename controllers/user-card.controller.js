const prisma = require("../prismaClient");
const {
  CardDetailsValidation,
} = require("../helper/validation/card.validation");
const {
  encrypt,
  maskCardNumber,
  validateCardNumber,
  detectCardType,
  isCardExpired,
} = require("../utils/encryption");

/**
 * Add card details for staff
 */
const addUserCardDetails = async (req, res) => {
  const userId = req.user.id;

  try {
    // Validate input
    const { error, value } = CardDetailsValidation.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details.map((e) => e.message),
      });
    }

    const {
      cardNumber,
      cardholderName,
      expiryMonth,
      expiryYear,
      cvv,
      isDefault,
    } = value;

    // Additional validation using Luhn algorithm
    if (!validateCardNumber(cardNumber)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid card number",
      });
    }

    // Check if card is expired
    if (isCardExpired(expiryMonth, expiryYear)) {
      return res.status(400).json({
        success: false,
        msg: "Card has expired",
      });
    }

    // Detect card type
    const detectedType = detectCardType(cardNumber);

    // If isDefault is true, unset default on all other cards
    if (isDefault) {
      await prisma.userCardDetails.updateMany({
        where: { userId: userId },
        data: { isDefault: false },
      });
    }

    // Encrypt sensitive data
    const encryptedCardNumber = encrypt(cardNumber);
    const encryptedCVV = encrypt(cvv);

    // Save card details
    const cardDetails = await prisma.userCardDetails.create({
      data: {
        userId: userId,
        cardholderName,
        lastFourDigits: cardNumber,
        expiryMonth,
        expiryYear,
        cardType: detectedType,
        isDefault: isDefault || false,
        encryptedCardNumber: JSON.stringify(encryptedCardNumber),
        encryptedCVV: JSON.stringify(encryptedCVV),
      },
    });

    return res.status(201).json({
      success: true,
      msg: "Card details added successfully",
      card: {
        id: cardDetails.id,
        cardholderName: cardDetails.cardholderName,
        lastFourDigits: cardDetails.lastFourDigits,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
        cardType: cardDetails.cardType,
        isDefault: cardDetails.isDefault,
        maskedNumber: maskCardNumber(cardNumber),
      },
    });
  } catch (error) {
    console.error("addUserCardDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not save card details",
      error: error.message,
    });
  }
};

/**
 * Get all card details for staff
 */
const getUserCardDetails = async (req, res) => {
  const userId = req.user.id;

  try {
    const cards = await prisma.userCardDetails.findMany({
      where: {
        userId: userId,
        isActive: true,
      },
    });

    const safeCards = cards.map(
      ({ lastFourDigits, encryptedCardNumber, encryptedCVV, ...rest }) => ({
        ...rest,
        isExpired: isCardExpired(rest.expiryMonth, rest.expiryYear),
        maskedNumber: `•••• •••• •••• ${lastFourDigits.slice(-4)}`,
      }),
    );

    return res.status(200).json({
      success: true,
      msg: "Card details fetched successfully",
      cards: safeCards,
    });
  } catch (error) {
    console.error("getUserCardDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not fetch card details",
      error: error.message,
    });
  }
};

/**
 * Delete card details
 */
const deleteUserCardDetails = async (req, res) => {
  const userId = req.user.id;
  const { cardId } = req.params;

  try {
    // Verify card belongs to this staff
    const card = await prisma.userCardDetails.findFirst({
      where: {
        id: cardId,
        userId: userId,
      },
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        msg: "Card not found",
      });
    }

    // Check if this is the last active card — at least one card must remain
    const activeCardCount = await prisma.userCardDetails.count({
      where: {
        userId: userId,
        isActive: true,
      },
    });

    if (activeCardCount <= 1) {
      return res.status(400).json({
        success: false,
        msg: "You must have at least one card. Add another card before deleting this one.",
      });
    }

    // Check if this is the default card
    if (card.isDefault) {
      // Find another active card to set as default
      const anotherCard = await prisma.userCardDetails.findFirst({
        where: {
          userId: userId,
          isActive: true,
          id: { not: cardId },
        },
        orderBy: { createdAt: "asc" },
      });

      // If another card exists, set it as default
      if (anotherCard) {
        await prisma.userCardDetails.update({
          where: { id: anotherCard.id },
          data: { isDefault: true },
        });
      }
    }

    // Soft delete (set isActive to false)
    await prisma.userCardDetails.update({
      where: { id: cardId },
      data: { isActive: false },
    });

    return res.status(200).json({
      success: true,
      msg: "Card deleted successfully",
    });
  } catch (error) {
    console.error("userCardDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not delete card",
      error: error.message,
    });
  }
};

/**
 * Set default card
 */
const setDefaultCard = async (req, res) => {
  const userId = req.user.id;
  const { cardId } = req.params;

  try {
    // Verify card belongs to this staff
    const card = await prisma.userCardDetails.findFirst({
      where: {
        id: cardId,
        userId: userId,
        isActive: true,
      },
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        msg: "Card not found",
      });
    }

    // Unset default on all cards
    await prisma.userCardDetails.updateMany({
      where: { userId: userId },
      data: { isDefault: false },
    });

    // Set this card as default
    await prisma.userCardDetails.update({
      where: { id: cardId },
      data: { isDefault: true },
    });

    return res.status(200).json({
      success: true,
      msg: "Default card updated successfully",
    });
  } catch (error) {
    console.error("setDefaultCard error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update default card",
      error: error.message,
    });
  }
};

/**
 * Update card details
 */
const updateUserCardDetails = async (req, res) => {
  const userId = req.user.id;
  const { cardId } = req.params;
  const { cardholderName, expiryMonth, expiryYear, cardType } = req.body;

  try {
    // Validate input
    if (!cardholderName || !expiryMonth || !expiryYear || !cardType) {
      return res.status(400).json({
        success: false,
        msg: "All fields are required",
      });
    }

    // Verify card belongs to this staff
    const card = await prisma.userCardDetails.findFirst({
      where: {
        id: cardId,
        userId: userId,
        isActive: true,
      },
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        msg: "Card not found",
      });
    }

    // Validate expiry date
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    if (expiryYear < currentYear) {
      return res.status(400).json({
        success: false,
        msg: "Card has expired",
      });
    }

    if (expiryYear === currentYear && expiryMonth < currentMonth) {
      return res.status(400).json({
        success: false,
        msg: "Card has expired",
      });
    }

    // Update card
    const updatedCard = await prisma.userCardDetails.update({
      where: { id: cardId },
      data: {
        cardholderName,
        expiryMonth: parseInt(expiryMonth),
        expiryYear: parseInt(expiryYear),
        cardType,
      },
    });

    return res.status(200).json({
      success: true,
      msg: "Card details updated successfully",
      card: {
        id: updatedCard.id,
        cardholderName: updatedCard.cardholderName,
        lastFourDigits: updatedCard.lastFourDigits,
        expiryMonth: updatedCard.expiryMonth,
        expiryYear: updatedCard.expiryYear,
        cardType: updatedCard.cardType,
        isDefault: updatedCard.isDefault,
      },
    });
  } catch (error) {
    console.error("userCardDetails error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server Error: Could not update card details",
      error: error.message,
    });
  }
};

module.exports = {
  addUserCardDetails,
  getUserCardDetails,
  updateUserCardDetails,
  deleteUserCardDetails,
  setDefaultCard,
};
