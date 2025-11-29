require('dotenv').config();

function handleNewMessage(req, res, io) {
  console.log('🔔 [WEBHOOK] Webhook received');
  
  // Verify webhook secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  // Supabase payload
  const payload = req.body;
  console.log('📦 [WEBHOOK] Received webhook payload:', JSON.stringify(payload, null, 2));

  // Event type: INSERT, UPDATE, DELETE
  const eventType = payload.type;
  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  switch (eventType) {
    case 'INSERT':
      // New message added
      handleInsert(record, io);
      break;

    case 'UPDATE':
      // Message edited or read receipt
      handleUpdate(record, io);
      break;

    case 'DELETE':
      // Message deleted
      handleDelete(oldRecord, io);
      break;

    default:
      console.log('Unknown event type:', eventType);
  }

  res.status(200).json({ success: true });
}

// ===== Event Handlers =====

function handleInsert(message, io) {
  console.log('🔵 [WEBHOOK] handleInsert called with message:', {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    groupId: message.groupId,
    content: message.content?.substring(0, 50)
  });

  if (message.recipientId) {
    // Emit to BOTH sender and recipient so both see the message in real-time
    const senderId = String(message.senderId);
    const recipientId = String(message.recipientId);
    
    
    io.to(recipientId).emit('newMessage', message);
    
    
    io.to(senderId).emit('newMessage', message);
  } else if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('newMessage', message);
  } else {
    console.log('⚠️ [WEBHOOK] Message has no recipientId or groupId');
  }
}

function handleUpdate(message, io) {
  // Emit messageUpdated to recipient and group
  if (message.recipientId) {
    io.to(message.recipientId).emit('messageUpdated', message);
  }
  if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('messageUpdated', message);
  }

  // If message is marked as read, notify the sender
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
