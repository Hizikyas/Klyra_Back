const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function sendMessage(req, res) {
  const { content, mediaUrl, recipientId, groupId } = req.body;
  const senderId = req.user.id;  // Assuming user is authenticated and req.user is set from middleware

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
        content : content || null,
        mediaUrl : mediaUrl || null,
        senderId,
        recipientId: recipientId || null,
        groupId: groupId || null,
      },
    });
    // The creation will trigger Supabase webhook, which broadcasts via WebSocket
    res.status(201).json({ 
        status : "success" ,
        message
     });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
        status : "failed" ,
         error: 'Failed to send message' 
        });
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
      // One-to-one messages between user and recipient
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
      // Group messages
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

module.exports = { sendMessage, getMessages };