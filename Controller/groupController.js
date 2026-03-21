const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client (only if environment variables are set)
let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

// Create a new group
exports.createGroup = async (req, res, next) => {
  try {
    const { name } = req.body;
    let { userIds } = req.body;
    const creatorId = req.user.id;

    // `userIds` may come as a JSON string (multipart requests)
    if (typeof userIds === "string") {
      try {
        userIds = JSON.parse(userIds);
      } catch {
        // fallback: allow comma-separated ids
        userIds = userIds.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    let avatarUrl = null;
    if (req.file) {
      if (!supabase) {
        return res.status(500).json({
          status: "fail",
          message: "Supabase is not configured for group avatar upload",
        });
      }

      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `group-avatar/${fileName}`;

      const { error } = await supabase.storage
        .from("avatar")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        return res.status(500).json({
          status: "fail",
          message: `Failed to upload group avatar: ${error.message}`,
        });
      }

      const { data: { publicUrl } } = supabase.storage
        .from("avatar")
        .getPublicUrl(filePath);

      avatarUrl = publicUrl;
    }

    // Create group
    const group = await prisma.group.create({
      data: {
        name,
        avatar: avatarUrl,
        members: {
          create: [
            // Add creator as admin
            {
              userId: creatorId,
              isAdmin: true,
              status: 'ACTIVE',
            },
            // Add other members
            ...(Array.isArray(userIds) ? userIds : []).map(userId => ({
              userId,
              isAdmin: false,
              status: 'ACTIVE',
            })),
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
        status: 'PENDING',
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

// Invited member accepts group invitation
exports.acceptGroupMemberInvitation = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    const member = await prisma.groupMember.findFirst({
      where: { groupId, userId, status: 'PENDING' },
    });

    if (!member) {
      return res.status(404).json({
        status: 'fail',
        message: 'Invitation not found',
      });
    }

    const updatedMember = await prisma.groupMember.update({
      where: { userId_groupId: { userId, groupId } },
      data: { status: 'ACTIVE' },
    });

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
              },
            },
          },
        },
      },
    });

    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupUpdated', {
      groupId,
      group: updatedGroup,
      member: updatedMember,
    });

    res.status(200).json({
      status: 'success',
      group: updatedGroup,
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message,
    });
  }
};

// Invited member declines group invitation
exports.declineGroupMemberInvitation = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    const member = await prisma.groupMember.findFirst({
      where: { groupId, userId, status: 'PENDING' },
    });

    if (!member) {
      return res.status(404).json({
        status: 'fail',
        message: 'Invitation not found',
      });
    }

    await prisma.groupMember.delete({
      where: { userId_groupId: { userId, groupId } },
    });

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
              },
            },
          },
        },
      },
    });

    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupUpdated', {
      groupId,
      group: updatedGroup,
    });

    res.status(200).json({
      status: 'success',
      group: updatedGroup,
      message: 'Invitation declined',
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
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
        status: 'ACTIVE',
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
      if (!supabase) {
        return res.status(500).json({
          status: "fail",
          message: "Supabase is not configured for media upload",
        });
      }

      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `media/${fileName}`;

      const { error } = await supabase.storage
        .from('messages')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        return res.status(500).json({
          status: "fail",
          message: `Failed to upload media: ${error.message}`,
        });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(filePath);

      mediaUrl = `${publicUrl}?name=${encodeURIComponent(req.file.originalname || "File")}`;
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

// Update group name + avatar (admin-only)
exports.updateGroup = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;
    const { name } = req.body;

    // Only admins can update group details
    const adminMember = await prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
        isAdmin: true,
      },
    });

    if (!adminMember) {
      return res.status(403).json({
        status: "fail",
        message: "Only admins can update group details",
      });
    }

    const updateData = {};
    if (typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }

    // Upload/replace group avatar if provided
    if (req.file) {
      if (!supabase) {
        return res.status(500).json({
          status: "fail",
          message: "Supabase is not configured for avatar upload",
        });
      }

      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `group-avatar/${fileName}`;

      const { error } = await supabase.storage
        .from('avatar')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        return res.status(500).json({
          status: "fail",
          message: `Failed to upload avatar: ${error.message}`,
        });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatar')
        .getPublicUrl(filePath);

      updateData.avatar = publicUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "No updates provided",
      });
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...updateData,
        updatedAt: new Date(),
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
              },
            },
          },
        },
      },
    });

    // Notify everyone currently viewing the group
    const io = req.app.get('io');
    io.to(`group:${groupId}`).emit('groupUpdated', {
      groupId,
      group: updatedGroup,
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