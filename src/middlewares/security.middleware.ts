import helmet from "helmet";
import rateLimit from "express-rate-limit";

export const securityHeaders = helmet();

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MAX_NUMBER_OF_REQUESTS),
  message: "Too many requests, please try again later.",
});
