const express = require("express") ;
const authController = require("../Controller/AuthenticationController")
const upload = require("../Utils/uploadImg")
const Router = express.Router() ;

Router.post("/signup" , upload.single('avatar'), authController.signup) ;
Router.post("/login" , authController.login) ;

module.exports = Router ;