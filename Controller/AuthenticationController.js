// const catchAsync = require("../Utils/catchAsync") ;
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.signup = async (req , res , next) => {
    try {
        const { fullName, fullname, email, username, phone, password, confirmPassword } = req.body;
        const resolvedFullName = fullName || fullname;
    
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
            status: "Fail",
            message: "User with this email, phone, or username already exists"
          });
        }
    
        const newUser = await prisma.user.create({
            data: {
                fullname: resolvedFullName,
                email,
                username,
                phone,
                password,
                confirmPassword
            }
        })
    
        res.status(201).json({
            status : "success"  ,
            user : newUser
        })
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(400).json({
            status: "fail",
            message: "Error creating user",
            error: error.message,
        });
    }
}