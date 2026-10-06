// multer.d.ts
declare module "multer" {
  import { RequestHandler } from "express";

  interface Multer {
    (options?: any): RequestHandler;
    memoryStorage(): any;
  }

  const multer: Multer;
  export = multer;
}
