const prisma = require("../prismaClient");

/* ---------------- CHECK IS IT CUSTOMER ---------------- */
const IsCustomer =  () => {
    return async (req, res, next) => {

        const user = await prisma.user.findUnique({
            where: { id : req.user.id }
        })


        if (user.role != "customer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Only Customer can Perform this action.",
            });
        }
        return next()

    }
}


module.exports = { IsCustomer };
