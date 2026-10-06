import { Api } from "@/api/main";
import { message } from "antd";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface State {
  packages: any[];
  create: (params: any, onSuccess?: Function, onError?: Function) => void;
  delete: (
    params: any,
    onSuccess?: Function,
    onError?: Function
  ) => void;
  update: (params: any, onSuccess?: Function, onError?: Function) => void;
  multipleList: (params:any) => void;
}

const initialState = {
  packages: [],
};

const usePackage = create<State>()(
  persist(
    (set) => ({
      ...initialState,
      async create(params, onSuccess?, onError?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .createPackage(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                onSuccess && onSuccess(res.data.message);
              } else {
                // @ts-ignore
                onError && onError(res.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async update(params, onSuccess?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .updatePackage(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                set((state) => ({
                  // @ts-ignore
                  // registerHistory: res.data?.data,
                }));
                // @ts-ignore
                onSuccess && onSuccess(res.data.message);
              } else {
                set((state) => ({
                  // registerHistory: [],
                }));
                // @ts-ignore
                message.info(res.data?.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async delete(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .deletePackage(params)
            .then((res) => {
              // @ts-ignore
              onSuccess && onSuccess(res.data.message);
            });
        } catch (e) {
          console.log(e);
        }
      },
      async multipleList(params) {
        try {
          // @ts-ignore
          Api.getInstance()
            .multipleListPackage(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                set((state) => ({
                  // @ts-ignore
                  packages: res.data?.data,
                }));
                // @ts-ignore
              } else {
                set((state) => ({
                  packages: [],
                }));
                // @ts-ignore
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "package",
    }
  )
);

export default usePackage;
