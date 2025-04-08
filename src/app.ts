import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import {morganMiddleware} from "./middlewares/morgan.middleware";

dotenv.config();

const app = express();

app.use(morganMiddleware);

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", router);

app.use(errorHandler);

export default app;