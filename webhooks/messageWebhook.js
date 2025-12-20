require('dotenv').config();

function handleNewMessage(req, res, io) {
  console.log('🔔 [WEBHOOK] Webhook received');
  
  // Verify webhook secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const payload = req.body;
  console.log('📦 [WEBHOOK] Received webhook payload:', JSON.stringify(payload, null, 2));

  const eventType = payload.type;
  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  switch (eventType) {
    case 'INSERT':
      handleInsert(record, io);
      break;

    case 'UPDATE':
      handleUpdate(record, io);
      break;

    case 'DELETE':
      handleDelete(oldRecord, io);
      break;

    default:
      console.log('Unknown event type:', eventType);
  }

  res.status(200).json({ success: true });
}

function handleInsert(message, io) {
  console.log('🔵 [WEBHOOK] handleInsert called with message:', {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    groupId: message.groupId,
    content: message.content?.substring(0, 50)
  });

  if (message.recipientId) {
    // DM message
    const senderId = String(message.senderId);
    const recipientId = String(message.recipientId);
    
    io.to(recipientId).emit('newMessage', message);
    io.to(senderId).emit('newMessage', message);
  } else if (message.groupId) {
    // Group message
    io.to(`group:${message.groupId}`).emit('groupMessage', message);
  } else {
    console.log('⚠️ [WEBHOOK] Message has no recipientId or groupId');
  }
}

function handleUpdate(message, io) {
  if (message.recipientId) {
    io.to(message.recipientId).emit('messageUpdated', message);
  }
  if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('messageUpdated', message);
  }

  if (message.isRead && message.senderId) {
    io.to(message.senderId).emit('messageRead', { messageId: message.id, isRead: true });
  }
}

function handleDelete(oldMessage, io) {
  if (oldMessage.recipientId) {
    io.to(oldMessage.recipientId).emit('messageDeleted', oldMessage.id);
  } else if (oldMessage.groupId) {
    io.to(`group:${oldMessage.groupId}`).emit('messageDeleted', oldMessage.id);
  }
}

module.exports = { handleNewMessage };