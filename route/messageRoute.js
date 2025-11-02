const express = require('express');
const { sendMessage, getMessages, updateMessage, deleteMessage, markAsRead, markMessagesAsRead, getConversations } = require('../Controller/messageController');
const { protect } = require('../Controller/AuthenticationController');
const upload = require('../Utils/uploadImg');

const Router = express.Router();

Router.use(protect);

Router.post('/', upload.single('media'), sendMessage);
Router.get('/', getMessages);
Router.get('/conversations', getConversations);
Router.patch('/:id', updateMessage);
Router.delete('/:id', deleteMessage);
Router.patch('/markAsRead/:id/', markAsRead);
Router.post('/mark-read', markMessagesAsRead);

module.exports = Router;