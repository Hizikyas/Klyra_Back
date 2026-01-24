// Controller/messageController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createClient } = require('@supabase/supabase-js');

let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
}


async function sendMessage(req, res) {
  const { content, recipientId, groupId, replyToId } = req.body;
  const senderId = req.user.id;

  if (!content && !req.file) {
    return res.status(400).json({ error: 'Message must have content or media' });
  }

  if (recipientId && groupId) {
    return res.status(400).json({ error: 'Specify either recipientId for one-to-one or groupId for group chat' });
  }

  if (!recipientId && !groupId) {
    return res.status(400).json({ error: 'Specify recipientId or groupId' });
  }

  let mediaUrl = null;
  let mediaType = null;

  if (req.file && supabase) {
    try {
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `media/${fileName}`; 

      const { data, error } = await supabase.storage
        .from('messages')  
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (error) {
        console.error('Error uploading media:', error);
        return res.status(500).json({ error: 'Failed to upload media' });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(filePath);

      mediaUrl = publicUrl;
      mediaType = req.file.mimetype; 
    } catch (uploadError) {
      console.error('Media upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload media' });
    }
  }

  try {
    const message = await prisma.message.create({
      data: {
        content: content || null,
        mediaUrl,
        mediaType, 
        senderId,
        recipientId: recipientId || null,
        groupId: groupId || null,
        replyToId: replyToId || null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullname: true,
            avatar: true
          }
        },
        recipient: {
          select: {
            id: true,
            username: true,
            fullname: true,
            avatar: true
          }
        },
        replyTo: {
          include: {
            sender: {
              select: {
                username: true
              }
            }
          }
        }
      },
    });

    // Emit socket event directly as backup (webhook might not fire immediately)
    const io = req.app.get('io');
    if (io && message) {
      console.log('📤 [CONTROLLER] Emitting message directly via socket');
      const senderIdStr = String(message.senderId);
      const recipientIdStr = String(message.recipientId);
      
      if (message.recipientId) {
        console.log(`📤 [CONTROLLER] Emitting to recipient room: ${recipientIdStr}`);
        io.to(recipientIdStr).emit('newMessage', message);
        
        console.log(`📤 [CONTROLLER] Emitting to sender room: ${senderIdStr}`);
        io.to(senderIdStr).emit('newMessage', message);
        
        console.log('✅ [CONTROLLER] Message emitted to both rooms');
      } else if (message.groupId) {
        io.to(`group:${message.groupId}`).emit('newMessage', message);
      }
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

async function getMessages(req, res) {
  const { recipientId, groupId } = req.query;
  const userId = req.user.id;

  if (recipientId && groupId) {
    return res.status(400).json({ error: 'Specify either recipientId or groupId' });
  }

  if (!recipientId && !groupId) {
    return res.status(400).json({ error: 'Specify recipientId or groupId' });
  }

  try {
    let messages;
    let conversationWhere = {};
    if (recipientId) {
      conversationWhere = {
        OR: [
          { senderId: userId, recipientId },
          { senderId: recipientId, recipientId: userId },
        ],
      };
    } else if (groupId) {
      conversationWhere = { groupId };
    }

    messages = await prisma.message.findMany({
      where: {
        AND: [
          conversationWhere,
          { deletedMessages: { none: { userId } } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { 
        sender: true, 
        recipient: true,
        replyTo: {
          include: {
            sender: true
          }
        } 
      },
    });
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

async function updateMessage(req, res) {
  const { id } = req.params;
  const { content, mediaUrl, isRead } = req.body;
  const userId = req.user.id;

  if (!content && !mediaUrl && isRead === undefined) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  try {
    // Check if the message exists and belongs to the user or recipient
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only the sender can update content or media; anyone can mark as read
    if (message.senderId !== userId && isRead === undefined) {
      return res.status(403).json({ error: 'Unauthorized to update message content' });
    }

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        content: content || undefined,
        mediaUrl: mediaUrl || undefined,
        isRead: isRead !== undefined ? isRead : undefined,
        isEdited: content ? true : undefined,
      },
    });

    res.status(200).json({ message: updatedMessage });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
}

async function markAsRead(req, res) {
  const { id } = req.params;
  const { isRead } = req.body;
  const userId = req.user.id;
  try {
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    //the sender can't update isRead; anyone can mark as read
    
    if (message.senderId === userId && isRead === undefined) {
      return res.status(403).json({ error: 'Unauthorized to mark as read the message' });
    }

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        isRead,
      },
    });

    res.status(200).json({ message: "message is mark as read" });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
}

async function deleteMessage(req, res) {
  const { id } = req.params;
  const { deleteForEveryone = false } = req.body;
  const userId = req.user.id;

  try {
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (deleteForEveryone && message.senderId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete for everyone' });
    }

    if (deleteForEveryone) {
      await prisma.message.update({
        where: { id },
        data: {
          isDeleted: true,
          content: null,
          mediaUrl: null,
          mediaType: null,
        },
      });
    } else {
      await prisma.deletedMessage.upsert({
        where: { userId_messageId: { userId, messageId: id } },
        create: { userId, messageId: id },
        update: {},
      });
    }

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
}

async function markMessagesAsRead(req, res) {
  const { recipientId } = req.body;
  const userId = req.user.id;

  if (!recipientId) {
    return res.status(400).json({ error: 'recipientId is required' });
  }

  try {
    // Mark all messages from the recipient as read
    const result = await prisma.message.updateMany({
      where: {
        senderId: recipientId,
        recipientId: userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.status(200).json({ 
      message: 'Messages marked as read',
      updatedCount: result.count 
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
}

async function getConversations(req, res) {
  const userId = req.user.id;

  try {
    // Get all unique users the current user has messaged with
    const conversations = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        },
        recipient: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by conversation partner and get latest message
    const conversationMap = new Map();
    
    conversations.forEach(message => {
      const partnerId = message.senderId === userId ? message.recipientId : message.senderId;
      const partner = message.senderId === userId ? message.recipient : message.sender;
      
      if (!partnerId || !partner) return; // Skip if no partner or group messages
      
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          participantId: partnerId,
          participant: partner,
          lastMessage: message,
          unreadCount: 0
        });
      }
    });

    // Count unread messages for each conversation
    for (const [partnerId, conv] of conversationMap) {
      const unreadCount = await prisma.message.count({
        where: {
          senderId: partnerId,
          recipientId: userId,
          isRead: false
        }
      });
      conv.unreadCount = unreadCount;
    }

    const result = Array.from(conversationMap.values())
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

    res.status(200).json({ conversations: result });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

module.exports = { sendMessage, getMessages, updateMessage, deleteMessage, markAsRead, markMessagesAsRead, getConversations };
