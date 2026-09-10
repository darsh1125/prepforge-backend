import type { SafeUser } from "./user.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; user: SafeUser };
    }
  }
}

export {};
