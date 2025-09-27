require('dotenv').config();

function handleNewMessage(req, res, io) {
  // Verify webhook secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    console.log('Invalid or missing webhook secret');
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  // Supabase payload
  const payload = req.body;
  console.log('Received webhook payload:', JSON.stringify(payload, null, 2));

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
  console.log('Insert event:', message);

  if (message.recipientId) {
    io.to(message.recipientId).emit('newMessage', message);
  } else if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('newMessage', message);
  }
}

function handleUpdate(message, io) {
  console.log('Update event:', message);

  if (message.recipientId) {
    io.to(message.recipientId).emit('messageUpdated', message);
  } else if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('messageUpdated', message);
  }
}

function handleDelete(oldMessage, io) {
  console.log('Delete event:', oldMessage);

  if (oldMessage.recipientId) {
    io.to(oldMessage.recipientId).emit('messageDeleted', oldMessage.id);
  } else if (oldMessage.groupId) {
    io.to(`group:${oldMessage.groupId}`).emit('messageDeleted', oldMessage.id);
  }
}

module.exports = { handleNewMessage };
