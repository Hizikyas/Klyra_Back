const express = require("express") ;
const authController = require("../Controller/AuthenticationController")
const Router = express.Router() ;

Router.post("/signup" , authController.signup) ;

module.exports = Router ;