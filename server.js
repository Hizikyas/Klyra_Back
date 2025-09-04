const dotenv = require("dotenv") ;
dotenv.config({path : "./configure.env" })
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const app = require("./app") ;


app.listen(4000, async () => {
    console.log("App running on port 4000")
    try {
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
})