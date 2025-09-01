// const dotenv = require("dotenv") ;
// dotenv.config({path : "./configure.env" })
const express = require('express');
const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

const app = express() ;

app.use(express.json())

// Test database connection
app.get('/health', async (req, res) => {
  try {
    await prisma.$connect();
    res.status(200).json({
      status: "success",
      message: "Database connected successfully"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get('/users' , async (req , res) => {
    try {
        const users = await prisma.user.findMany();
        res.status(200).json({
            status : "success" ,
            user : users
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: "Failed to fetch users",
            error: error.message
        });
    }
})

app.post("/users", async (req, res) => {
  try {
    // Get user data from request body instead of hardcoded values
    const { fullname, username, email, phone, password, confirmPassword } = req.body;
    
    // Validate required fields
    if (!fullname || !username || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({
        status: "fail",
        message: "All fields are required"
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { phone: phone },
          { username: username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "User with this email, phone, or username already exists"
      });
    }

    const newUser = await prisma.user.create({
      data: {
        fullname,
        username,
        email,
        phone,
        password,
        confirmPassword
      },
    });

    res.status(201).json({
      status: "success",
      user: newUser,
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(400).json({
      status: "fail",
      message: "Error creating user",
      error: err.message,
    });
  }
});

app.listen(4000, async () => {
    console.log("App running on port 4000")
    try {
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
})