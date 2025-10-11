const express = require('express');
const { sendMessage, getMessages, updateMessage, deleteMessage , markAsRead } = require('../Controller/messageController');
const { protect } = require('../Controller/AuthenticationController'); 

const Router = express.Router();

Router.use(protect);

Router.post('/', sendMessage);
Router.get('/', getMessages);
Router.patch('/:id', updateMessage); 
Router.delete('/:id', deleteMessage);
Router.patch('/markAsRead/:id/', markAsRead); 

module.exports = Router;
