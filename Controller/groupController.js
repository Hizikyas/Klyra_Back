const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Create a new group
exports.createGroup = async (req, res, next) => {
  try {
    const { name, userIds } = req.body;
    const creatorId = req.user.id;

    // Create group
    const group = await prisma.group.create({
      data: {
        name,
        members: {
          create: [
            // Add creator as admin
            {
              userId: creatorId,
              isAdmin: true,
            },
            // Add other members
            ...userIds.map(userId => ({
              userId,
              isAdmin: false,
            }))
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullname: true,
                avatar: true,
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      status: "success",
      group,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Get all groups for current user
exports.getUserGroups = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullname: true,
                avatar: true,
              }
            }
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc',
      }
    });

    res.status(200).json({
      status: "success",
      groups,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Get group details
exports.getGroup = async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullname: true,
                avatar: true,
              }
            }
          }
        },
      }
    });

    if (!group) {
      return res.status(404).json({
        status: "fail",
        message: "Group not found",
      });
    }

    res.status(200).json({
      status: "success",
      group,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Add members to group
exports.addMembers = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const { userIds } = req.body;
    const currentUserId = req.user.id;

    // Check if user is admin
    const member = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: currentUserId,
        isAdmin: true,
      }
    });

    if (!member) {
      return res.status(403).json({
        status: "fail",
        message: "Only admins can add members",
      });
    }

    // Add new members
    await prisma.groupMember.createMany({
      data: userIds.map(userId => ({
        groupId,
        userId,
        isAdmin: false,
      })),
      skipDuplicates: true,
    });

    // Get updated group
    const updatedGroup = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullname: true,
                avatar: true,
              }
            }
          }
        },
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    userIds.forEach(userId => {
      io.to(userId).emit('groupMemberAdded', {
        groupId,
        member: updatedGroup.members.find(m => m.userId === userId)
      });
    });

    res.status(200).json({
      status: "success",
      group: updatedGroup,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Remove member from group
exports.removeMember = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;
    const currentUserId = req.user.id;

    // Check if user is admin or removing themselves
    const isAdmin = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: currentUserId,
        isAdmin: true,
      }
    });

    if (!isAdmin && currentUserId !== userId) {
      return res.status(403).json({
        status: "fail",
        message: "Only admins can remove members",
      });
    }

    // Remove member
    await prisma.groupMember.delete({
      where: {
        userId_groupId: {
          userId,
          groupId,
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(userId).emit('groupMemberRemoved', { groupId, userId });
    io.to(`group:${groupId}`).emit('memberLeft', { groupId, userId });

    res.status(200).json({
      status: "success",
      message: "Member removed successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Leave group
exports.leaveGroup = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Remove member
    await prisma.groupMember.delete({
      where: {
        userId_groupId: {
          userId,
          groupId,
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('memberLeft', { groupId, userId });

    res.status(200).json({
      status: "success",
      message: "Left group successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Get group messages
exports.getGroupMessages = async (req, res, next) => {
  try {
    const groupId = req.params.id;

    const messages = await prisma.message.findMany({
      where: { groupId },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullname: true,
            avatar: true,
          }
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc',
      }
    });

    res.status(200).json({
      status: "success",
      messages,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

// Send message to group
exports.sendGroupMessage = async (req, res, next) => {
  try {
    const { groupId, content, replyToId } = req.body;
    const senderId = req.user.id;

    // Check if user is member of group
    const member = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: senderId,
      }
    });

    if (!member) {
      return res.status(403).json({
        status: "fail",
        message: "You are not a member of this group",
      });
    }

    let mediaUrl, mediaType;
    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype;
    }

    const message = await prisma.message.create({
      data: {
        content,
        mediaUrl,
        mediaType,
        senderId,
        groupId,
        replyToId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullname: true,
            avatar: true,
          }
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      }
    });

    // Update group's updatedAt
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupMessage', message);

    res.status(201).json({
      status: "success",
      message,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};