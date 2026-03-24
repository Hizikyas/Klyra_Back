const bcrypt = require('bcryptjs');
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../Utils/sendEmail');

// Initialize Supabase client (only if environment variables are set)
let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
}


const changedPasswordAfter = (passwordChangedAt , jwtTimestamp) => {
   if (passwordChangedAt) {
    const changedTimestamp = parseInt(passwordChangedAt.getTime() / 1000, 10);
    return jwtTimestamp < changedTimestamp;
  }
  return false;
}

exports.signup = async (req , res , next) => {
    try {
        const { fullname, email, username, phone, password, confirmPassword } = req.body;
        
    
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

        let avatarUrl = null;
    
        // Handle avatar upload if provided
        if (req.file && supabase) {
          try {
            // Generate unique filename
            const fileExt = req.file.originalname.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
            const filePath = `avatar/${fileName}`;
      
            // Upload to Supabase storage
            const { data, error } = await supabase.storage
              .from('avatar')  // Bucket name
              .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
              });
      
            if (error) {
              console.error('Error uploading avatar:', error);
              // Continue without avatar if upload fails
            } else {
              // Get public URL
              const { data: { publicUrl } } = supabase.storage
                .from('avatar')
                .getPublicUrl(filePath);
              
              avatarUrl = publicUrl;
            }
          } catch (uploadError) {
            console.error('Avatar upload error:', uploadError);
            // Continue without avatar if upload fails
          }
        } else if (req.file && !supabase) {
          console.log('Supabase not configured - avatar upload skipped');
          console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
          console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set');
        }

        const hashedPassword = await bcrypt.hash(password, 12);
    
        const newUser = await prisma.user.create({
            data: {
                fullname ,
                email,
                username,
                phone,
                password : hashedPassword,
                avatar: avatarUrl,
                updatedAt: new Date()
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
      secure : false ,
      sameSite : 'none'
      // secure : process.env.NODE_ENV === 'PRODUCTION' ,
      // sameSite : process.env.NODE_ENV === 'PRODUCTION' ? 'none' : 'lax'

    }
    res.cookie('jwt', token, cookieOptions);
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

        if (currentUser.passwordChangedAt && changedPasswordAfter(currentUser.passwordChangedAt, decoded.iat)) {
          return res.status(401).json({
              status: "fail",
              message: "User recently changed password! Please login again"
          });
        }

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

exports.forgotPassword = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: req.body.email } });
        if (!user) {
            return res.status(404).json({ status: "fail", message: "There is no user with this email address." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); 

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordOtp: otp,
                resetPasswordExpires: expires
            }
        });

        const message = `Your password reset OTP is ${otp}. It is valid for 10 minutes.\nIf you didn't forget your password, please ignore this email!`;
        try {
            await sendEmail({
                email: user.email,
                subject: 'Your password reset token (valid for 10 min)',
                message
            });
            res.status(200).json({ status: "success", message: "Token sent to email!" });
        } catch (err) {
            await prisma.user.update({
                where: { id: user.id },
                data: { resetPasswordOtp: null, resetPasswordExpires: null }
            });
            return res.status(500).json({ status: "fail", message: "There was an error sending the email. Try again later!" });
        }
    } catch (error) {
        res.status(400).json({ status: "fail", message: error.message });
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { email, otp, password } = req.body;
        const user = await prisma.user.findFirst({
            where: {
                email,
                resetPasswordOtp: otp,
                resetPasswordExpires: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ status: "fail", message: "OTP is invalid or has expired" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordOtp: null,
                resetPasswordExpires: null,
                passwordChangedAt: new Date()
            }
        });

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE_IN });
        res.status(200).json({ status: "success", token });
    } catch (error) {
        res.status(400).json({ status: "fail", message: error.message });
    }
};
