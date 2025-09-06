const bcrypt = require('bcryptjs');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

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

        const hashedPassword = await bcrypt.hash(password, 12);
    
        const newUser = await prisma.user.create({
            data: {
                fullname: resolvedFullName,
                email,
                username,
                phone,
                password : hashedPassword
            }
        })
        newUser.password = undefined;
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

exports.login = async (req , res , next) => {
  try{
    const { username, password } = req.body;

     if(!username || !password) {
        return res.status(400).json({
            status : "fail" ,
            message : "Please provide username and password"
        })
     }
 
   const user = await prisma.user.findFirst({
        where: { username: username } });

   if(!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({
            status : "fail" ,
            message : "Incorrect username or password"
        })
   }
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE_IN });

    const cookieOptions = {
      expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
      httpOnly: true ,
      secure : true ,
      sameSite : 'none'

    }
    res.cookie('jwt', token, cookieOptions);
   // Remove password from response
   user.password = undefined;
   
   res.status(200).json({
       status: "success",
       message: "Login successful",
       user: user,
       token : token
   });

  } catch (error) {
    res.status(400).json({
        status: "fail",
        message: "Error during login",
        error: error.message,
        });
    }
}


exports.protect = async (req, res, next) => {
    try {
        let token;

        // Get token from header or cookie
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            return res.status(401).json({
                status: "fail",
                message: "You are not logged in! Please login to access"
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from token
        const currentUser = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!currentUser) {
            return res.status(401).json({
                status: "fail",
                message: "The user belonging to this token does no longer exist"
            });
        }

        // Grant access to protected route
        req.user = currentUser;
        next();
    } catch (error) {
        return res.status(401).json({
            status: "fail",
            message: "Invalid token or token expired"
        });
    }
}


exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                status: "fail",
                message: "You do not have permission to perform this action"
            });
        }
        next();
    }
}


exports.logout = async (req, res, next) => {
    try {
        // Clear the JWT cookie
        res.cookie('jwt', 'loggedout', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });

        res.status(200).json({
            status: "success",
            message: "User logged out successfully"
        });
    } catch (error) {
        res.status(400).json({
            status: "fail",
            message: "Error during logout",
            error: error.message
        });
    }
}