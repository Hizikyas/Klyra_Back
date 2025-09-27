const dotenv = require("dotenv") ;
dotenv.config({path : "./configure.env" })

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = require("./app") ;
const http = require('http');
const { Server } = require('socket.io');
const { handleNewMessage } = require('./webhooks/messageWebhook');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.set('io', io);

// Socket.IO setup
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join', (room) => {
    console.log(`Socket ${socket.id} joined room ${room}`);
    socket.join(room);
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});


server.listen(4000, async () => {
    console.log("App running on port 4000")
    try {
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
})