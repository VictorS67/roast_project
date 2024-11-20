import express from "express";
import appRouter from "./app/index.js";

const router = express.Router();

router.use("/app", appRouter);

export default router;
