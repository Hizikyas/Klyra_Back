const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const AppFeatures = require("../Utils/AppFeatures")

exports.getAllUser = async (req, res, next) => {
  try {
    const features = new AppFeatures(req.query)
      .filter()
      .sort()
      .limitFields()
      .pagination()
      .build();

    // Fetch users with Prisma
    const users = await prisma.user.findMany(features);

    res.status(200).json({
      status: "success",
      result: users.length,
      users,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

exports.getUser = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: {id : req.params.id },
        });
        if (!user) {
            return res.status(404).json({
                status: "fail",
                message: "No user found with that ID"
            });
        }

        // Calculate statistics
        const messagesCount = await prisma.message.count({
            where: {
                OR: [
                    { senderId: req.params.id },
                    { recipientId: req.params.id }
                ]
            }
        });

        const sentMessages = await prisma.message.findMany({
            where: { senderId: req.params.id, recipientId: { not: null } },
            select: { recipientId: true },
            distinct: ['recipientId']
        });
        
        const receivedMessages = await prisma.message.findMany({
            where: { recipientId: req.params.id },
            select: { senderId: true },
            distinct: ['senderId']
        });
        
        const friendIds = new Set([
            ...sentMessages.map(m => m.recipientId),
            ...receivedMessages.map(m => m.senderId)
        ]);
        
        const friendsCount = friendIds.size;

        res.status(200).json({
            status: "success",
            user: {
                ...user,
                messagesCount,
                friendsCount
            }
        });
    } catch (error) {
        res.status(400).json({
            status: "fail",
            message: error.message
        });
    }
};

exports.updateUser = async (req, res, next) => {
    const allowedFields = [
        "fullname",
        "username",
        "email",
        "phone",
        "avatar",
        "bio"
    ];
    const updateData = {};
    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.status(200).json({
            status: "success",
            user
        });
    } catch (error) {
        res.status(400).json({
            status: "fail",
            message: error.message
        });
    }
};
 