import { Api } from "@/api/main";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  users: any[];
  setClear: () => void;
  create: (params: any, onSuccess: Function, onError?:Function) => void;
  update: (params: any, onSuccess: Function,onError?:Function) => void;
  delete: (params: any, onSuccess: Function,onError?:Function) => void;
  multipleList: (params: any, onError?:Function) => void;
}

const initialState = {
  users: [],
};

const useUser = create<UserState>()(
  persist(
    (set) => ({
      ...initialState,
      async setClear() {
        set((state) => ({
          users: [],
        }));
      },
      async create(params, onSuccess, onError?) {
        try {
          Api.getInstance()
            .createUser(params)
            .then((res:any) => {
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                onSuccess(res.data.message);
              } else {
                 // @ts-ignore
                onError(res.data.message);
              }
            });
        } catch (e: any) {
          onError && onError(e.message || e)
        }
      },
      async update(params, onSuccess, onError?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .updateUser(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                onSuccess(res.data.message);
              } else {
                // @ts-ignore
                onError(res.data.message)
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async delete(params, onSuccess, onError?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .deleteUser(params)
            .then((res) => {
              if(res.status == 200 || res.status == 201){
                // @ts-ignore
                onSuccess(res.data.message);
              }else{
                // @ts-ignore
                onError && onError(res.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async multipleList(params, onError?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .multipleListUser(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                set((state) => ({
                  // @ts-ignore
                  users: res.data.data,
                }));
                // @ts-ignore
              } else {
                // @ts-ignore
                 onError && onError(res.data.message)
                set((state) => ({
                  users: [],
                }));
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "user",
    }
  )
);

export default useUser;

