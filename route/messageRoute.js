const express = require('express');
const { sendMessage, getMessages, updateMessage, deleteMessage , markAsRead } = require('../Controller/messageController');
const { protect } = require('../Controller/AuthenticationController'); 

const Router = express.Router();

Router.use(protect);

Router.post('/', protect ,  sendMessage);
Router.get('/', protect ,getMessages);
Router.patch('/:id', protect ,updateMessage); 
Router.delete('/:id', protect ,deleteMessage);
Router.patch('/markAsRead/:id/', protect ,markAsRead); 

module.exports = Router;
