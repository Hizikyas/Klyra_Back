const dotenv = require("dotenv") ;
dotenv.config({path : "./configure.env" })

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = require("./app") ;
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client (only if environment variables are set)
let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST' , 'PUT' , 'DELETE' , 'PATCH'],
    credentials: true,
  }
});

app.set('io', io); // to set io instance in app for access in routes

// Socket.IO connection handling 

io.on('connection', (socket) => { // socket is the client(users browser or phone) and the io is main server that manages all the connections
  console.log('Socket connected:', socket.id);
  const connectedUsers = new Map();
  const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

  if (userId) {
    connectedUsers.set(socket.id, userId);
    socket.join(userId);

    // Emit to ALL clients: this user is online
    io.emit('userOnline', { userId });
    console.log(`User ${userId} is online`);
  }

  socket.on('joinUser', (userId) => { // this will add the user in the room , this code will listen to the event when users login and sends this code by sending userId socket.emit("joinUser" , userId) join the room with their userId, the room is created by their userId so if the message is sent by the room name so that the room contains the user which joins the room 
    socket.join(userId);
    if (!connectedUsers.has(socket.id)) {
      connectedUsers.set(socket.id, userId);
      io.emit('userOnline', { userId });
    }
  });

  socket.on('joinGroup', (groupId) => {
    socket.join(`group:${groupId}`); // align with webhook emitter
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
    const disconnectedUserId = connectedUsers.get(socket.id);
    if (disconnectedUserId) {
      connectedUsers.delete(socket.id);

      // Emit to ALL clients: user went offline + lastSeen
      io.emit('userOffline', {
        userId: disconnectedUserId,
        lastSeen: new Date().toISOString(),
      });
      console.log(`User ${disconnectedUserId} is offline`);
    }
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