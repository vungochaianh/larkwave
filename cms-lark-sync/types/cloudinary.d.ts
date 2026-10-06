// types/cloudinary.d.ts
declare module "cloudinary" {
  export const v2: {
    config: (options: {
      cloud_name: string;
      api_key: string;
      api_secret: string;
    }) => void;
    uploader: {
      upload_stream: (
        options: { resource_type: string },
        callback: (error: any, result: any) => void
      ) => { end: (buffer: Buffer) => void };
    };
  };

  export function config(arg0: {
    cloud_name: string;
    api_key: string;
    api_secret: string;
  }) {
    throw new Error("Function not implemented.");
  }
}
