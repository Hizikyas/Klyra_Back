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
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'https://klyra-gk1740ufw-hizikyas-tamirus-projects.vercel.app',
        'https://klyra-inky.vercel.app',
        process.env.FRONTEND_URL
      ].filter(Boolean);

      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  }
});

app.set('io', io); // to set io instance in app for access in routes

// Socket.IO connection handling
const connectedUsers = new Map(); // socket.id -> userId
const onlineUsers = new Set(); // userId of online users

io.on('connection', (socket) => { // socket is the client(users browser or phone) and the io is main server that manages all the connections
  console.log('Socket connected:', socket.id);
  const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

  if (userId) {
    connectedUsers.set(socket.id, userId);
    socket.join(userId);

    // Add to online users if not already
    if (!onlineUsers.has(userId)) {
      onlineUsers.add(userId);
      // Emit to ALL clients: this user is online
      io.emit('userOnline', { userId });
      console.log(`User ${userId} is online`);
    }

    // Send current online users to the new client
    socket.emit('onlineUsers', Array.from(onlineUsers));
  }

  socket.on('joinUser', (userId) => { // this will add the user in the room , this code will listen to the event when users login and sends this code by sending userId socket.emit("joinUser" , userId) join the room with their userId, the room is created by their userId so if the message is sent by the room name so that the room contains the user which joins the room
    socket.join(userId);
    if (!connectedUsers.has(socket.id)) {
      connectedUsers.set(socket.id, userId);
      if (!onlineUsers.has(userId)) {
        onlineUsers.add(userId);
        io.emit('userOnline', { userId });
      }
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

      // Check if user has other active connections
      let hasOtherConnections = false;
      for (const [sockId, uid] of connectedUsers) {
        if (uid === disconnectedUserId) {
          hasOtherConnections = true;
          break;
        }
      }

      // Only emit offline if no other connections
      if (!hasOtherConnections) {
        onlineUsers.delete(disconnectedUserId);
        io.emit('userOffline', {
          userId: disconnectedUserId,
          lastSeen: new Date().toISOString(),
        });
        console.log(`User ${disconnectedUserId} is offline`);
      }
    }
  });
});


const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  console.log(`App running on port ${PORT}`)
    try {
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
})