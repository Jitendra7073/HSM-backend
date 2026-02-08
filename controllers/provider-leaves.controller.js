
// Get all leaves for a staff member (for provider viewing history)
const getStaffLeaves = async (req, res) => {
    const providerId = req.user.id;
    const { staffId } = req.params;

    try {
        const business = await prisma.businessProfile.findUnique({
            where: { userId: providerId },
        });

        if (!business) {
            return res.status(404).json({ success: false, msg: "Business profile not found." });
        }

        // Verify staff belongs to this business
        const application = await prisma.staffApplications.findFirst({
            where: {
                staffId: staffId,
                businessProfileId: business.id,
            },
        });

        if (!application) {
            return res.status(404).json({ success: false, msg: "Staff member not found or authorized." });
        }

        // Fetch ALL leaves for this staff member
        const leaves = await prisma.staffLeave.findMany({
            where: {
                staffId: staffId,
            },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({
            success: true,
            msg: "Staff leaves fetched successfully",
            leaves,
        });
    } catch (error) {
        console.error("getStaffLeaves error:", error);
        return res.status(500).json({ success: false, msg: "Server Error" });
    }
};

module.exports = {
    getStaffLeaves,
};
