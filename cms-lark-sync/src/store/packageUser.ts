import { Api } from "@/api/main";
import { message } from "antd";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface State {
  registerHistory: any[];
  allRegisterHistory: any[];
  delete: (params: any, onSuccess?: Function,onError?: Function) => void;
  create: (params: any, onSuccess?: Function,onError?: Function) => void;
  multipleList: (params: any, type?: 'single' | 'multiple') => void;
}

const initialState = {
  registerHistory: [],
  allRegisterHistory: [],
};

const usePackageUser = create<State>()(
  persist(
    (set) => ({
      ...initialState,
      async create(params, onSuccess, onError) {
        try {
          // @ts-ignore
          Api.getInstance()
            .createPackageUser(params)
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
      async delete(params, onSuccess, onError) {
        try {
          // @ts-ignore
          Api.getInstance()
            .deletePackagesUser(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                onSuccess && onSuccess(res.data?.message);
              } else {
                // @ts-ignore
                onSuccess && onSuccess(res.data?.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async multipleList(params, type = 'single') {
        try {
          // @ts-ignore
          Api.getInstance()
            .multipleListPackageUser(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                type == 'single' ? 
                set((state) => ({
                  // @ts-ignore
                  registerHistory: res.data?.data,
                })) : set((state) => ({
                  // @ts-ignore
                  allRegisterHistory: res.data?.data,
                }))
                // @ts-ignore
              } else {
                type == 'single' ? 
                set((state) => ({
                  // @ts-ignore
                  registerHistory: [],
                })) : set((state) => ({
                  // @ts-ignore
                  allRegisterHistory: [],
                }))
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "package-user",
    }
  )
);

export default usePackageUser;
