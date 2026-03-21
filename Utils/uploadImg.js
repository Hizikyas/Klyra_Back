const multer = require('multer');

// Configure multer for memory storage (file will be in req.file.buffer)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for media files
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, documents, and other media types
    const allowedTypes = [
      'image/',
      'video/',
      'audio/',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    const mimeType = (file.mimetype || "").toLowerCase();
    const originalName = (file.originalname || "").toLowerCase();

    const isAllowedByMime = allowedTypes.some(type => mimeType.startsWith(type));
    const isDocxOctetStream = mimeType === "application/octet-stream" && originalName.endsWith(".docx");

    if (isAllowedByMime || isDocxOctetStream) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

module.exports = upload;
