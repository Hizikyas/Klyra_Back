const express = require("express");
const groupController = require("../controllers/groupController");
const authController = require("../controllers/authController");
const upload = require("../utils/upload");

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

router.post("/messages", upload.single('media'), groupController.sendGroupMessage);

module.exports = router;