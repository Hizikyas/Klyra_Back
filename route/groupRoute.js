const express = require("express");
const groupController = require("../Controller/groupController");
const authController = require("../Controller/AuthenticationController");
const upload = require("../Utils/uploadImg");

const router = express.Router();

// Protect all routes
router.use(authController.protect);

// Group routes
router.post("/", groupController.createGroup);
router.get("/", groupController.getUserGroups);

router.get("/:id", groupController.getGroup);
router.get("/:id/messages", groupController.getGroupMessages);
router.post("/:id/members", groupController.addMembers);
router.delete("/:id/members/:userId", groupController.removeMember);
router.post("/:id/leave", groupController.leaveGroup);

// Group messages
router.post("/messages", upload.single('media'), groupController.sendGroupMessage);

module.exports = router;