const express = require('express');
const { sendMessage, getMessages } = require('../Controller/messageController');
const { protect } = require('../Controller/AuthenticationController'); 

const Router = express.Router();

Router.use(protect);

Router.post('/', sendMessage);
Router.get('/', getMessages);

module.exports = Router;
