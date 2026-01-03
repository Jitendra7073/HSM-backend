/**
 * Format cancellation details for provider dashboard
 */
const formatCancellationDetails = (cancelDetails, user, service, booking) => {
    // Calculate days until service was supposed to happen
    const bookingDate = new Date(booking.date);
    const now = new Date();
    const daysUntilService = Math.ceil((bookingDate - now) / (1000 * 60 * 60 * 24));

    // Format cancellation reason type with human-readable labels
    const reasonTypeMap = {
        "personal": "Personal Reason",
        "emergency": "Emergency",
        "schedule_conflict": "Schedule Conflict",
        "service_issue": "Service Issue",
        "other": "Other"
    };
    const formattedReasonType = reasonTypeMap[cancelDetails?.reasonType] || cancelDetails?.reasonType;

    // Determine cancellation fee percentage based on hours
    const getFeePercentage = (hours) => {
        if (hours < 4) return 50;
        if (hours < 12) return 25;
        if (hours < 24) return 10;
        return 0;
    };

    const feePercentage = getFeePercentage(cancelDetails?.hoursBeforeService || 0);

    return {
        id: cancelDetails?.id,
        bookingId: cancelDetails?.bookingId,

        /* -------- CANCELLATION INFO -------- */
        cancellation: {
            cancelledBy: user?.name || "Unknown",
            cancelledAt: cancelDetails?.requestedAt,
            reason: cancelDetails?.reason,
            reasonType: formattedReasonType,
        },

        /* -------- SERVICE INFO -------- */
        service: {
            name: service?.name,
            price: service?.price,
            totalAmount: booking?.totalAmount,
        },

        /* -------- REFUND INFO -------- */
        refund: {
            status: cancelDetails?.refundStatus,
            amount: cancelDetails?.refundAmount,
            fee: cancelDetails?.cancellationFee,
            feePercentage: feePercentage,
            refundedAt: cancelDetails?.refundedAt,
        },

        /* -------- TIMING INFO -------- */
        timing: {
            hoursBeforeService: cancelDetails?.hoursBeforeService,
            daysUntilService: daysUntilService > 0 ? daysUntilService : 0,
            serviceDate: booking?.date,
            cancelledDate: cancelDetails?.requestedAt,
        },

        /* -------- PROVIDER PROFIT -------- */
        providerProfit: {
            amount: cancelDetails?.cancellationFee || 0,
            description: `Provider earns ₹${cancelDetails?.cancellationFee || 0} as cancellation fee (${feePercentage}% of ₹${booking?.totalAmount})`
        },

        /* -------- STATUS -------- */
        status: cancelDetails?.status,
    };
};

/**
 * Get cancellation fee details with breakdown
 */
const getCancellationFeeBreakdown = (totalAmount, hoursBeforeService) => {
    let feePercentage = 0;

    if (hoursBeforeService < 4) feePercentage = 50;
    else if (hoursBeforeService < 12) feePercentage = 25;
    else if (hoursBeforeService < 24) feePercentage = 10;

    const cancellationFee = Math.round((totalAmount * feePercentage) / 100);
    const refundAmount = totalAmount - cancellationFee;

    return {
        totalAmount,
        feePercentage,
        cancellationFee,
        refundAmount,
        breakdown: {
            original: totalAmount,
            fee: cancellationFee,
            customerRefund: refundAmount,
            providerProfit: cancellationFee
        }
    };
};

module.exports = {
    formatCancellationDetails,
    getCancellationFeeBreakdown,
};
