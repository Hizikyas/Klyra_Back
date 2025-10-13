// Controller/messageController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function sendMessage(req, res) {
  const { content, mediaUrl, recipientId, groupId } = req.body;
  const senderId = req.user.id; // Assuming req.user is set by protect middleware

  if (!content && !mediaUrl) {
    return res.status(400).json({ error: 'Message must have content or media' });
  }

  if (recipientId && groupId) {
    return res.status(400).json({ error: 'Specify either recipientId for one-to-one or groupId for group chat' });
  }

  if (!recipientId && !groupId) {
    return res.status(400).json({ error: 'Specify recipientId or groupId' });
  }

  try {
    const message = await prisma.message.create({
      data: {
        content,
        mediaUrl,
        senderId,
        recipientId: recipientId || null,
        groupId: groupId || null,
      },
    });
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
    if (recipientId) {
      messages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId, recipientId },
            { senderId: recipientId, recipientId: userId },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: { sender: true, recipient: true },
      });
    } else if (groupId) {
      messages = await prisma.message.findMany({
        where: { groupId },
        orderBy: { createdAt: 'asc' },
        include: { sender: true, group: true },
      });
    }
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
  const userId = req.user.id;

  try {
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete message' });
    }

    await prisma.message.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
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

module.exports = { sendMessage, getMessages, updateMessage, deleteMessage, markAsRead, getConversations };