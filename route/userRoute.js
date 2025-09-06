const express = require("express") ;
const authController = require("../Controller/AuthenticationController")
const Router = express.Router() ;

Router.post("/signup" , authController.signup) ;
Router.post("/login" , authController.login) ;

module.exports = Router ;