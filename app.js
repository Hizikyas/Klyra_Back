const express = require('express');
const cors = require('cors');
const { PrismaClient } = require("@prisma/client");
// const prisma = new PrismaClient();

const userRoute = require("./route/userRoute");
const messageRouter = require("./route/messageRoute");
const groupRouter = require("./route/groupRoute");
const { handleNewMessage } = require('./webhooks/messageWebhook');

const app = express();
app.use(express.json());

const allowedOrigins = [
    'http://localhost:3000',
    'https://klyra-gk1740ufw-hizikyas-tamirus-projects.vercel.app',
    'https://klyra-inky.vercel.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));

// Routes
app.use("/v1/users", userRoute);
app.use("/v1/messages", messageRouter);
app.use("/v1/groups", groupRouter); // Add this

// Webhook route
app.post('/webhook/message', (req, res) => {
  const ioInstance = app.get('io');
  handleNewMessage(req, res, ioInstance);
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        status: "fail",
        message: "can not find " + req.originalUrl + " on this server" 
    });
});

module.exports = app;