const express = require("express") ;
const authController = require("../Controller/AuthenticationController")
const UserController = require("../Controller/userController")
const upload = require("../Utils/uploadImg")
const Router = express.Router() ;

Router.post("/signup" , upload.single('avatar'), authController.signup) ;
Router.post("/login" , authController.login) ;

Router.get("/" , UserController.getAllUser) ;

Router.route("/:id")
.get( UserController.getUser) 
.patch(UserController.updateUser) ;

module.exports = Router ;