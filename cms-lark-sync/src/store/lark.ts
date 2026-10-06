import { Api } from "@/api/main";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface State {
  lark_config: {} ;
  createConfig: (params: any, onSuccess?: Function, onError?: Function) => void;
  readConfig:(params: any, onSuccess?: Function, onError?: Function) => void;
  deleteConfig: (
    params: any,
    onSuccess?: Function,
    onError?: Function
  ) => void;
  updateConfig: (params: any, onSuccess?: Function, onError?: Function) => void;
}

const initialState = {
  lark_config: {},
};

const useLark = create<State>()(
  persist(
    (set) => ({
      ...initialState,
      async createConfig(params, onSuccess?, onError?) {
        try {
          // localStorage.setItem("lark_config", params)
          set(() => ({lark_config: params}))
          // Api.getInstance()
          //   .createConfigLark(params)
          //   .then((res:any) => {
          //     if (res.status == 200 || res.status == 201) {
          //       set(() => ({
          //         lark_config: res.data.data
          //       }));
          //       onSuccess && onSuccess(res.data.message);
          //     } else {
          //       onError && onError(res.data.message);
          //     }
          //   });
        } catch (e) {
          console.log(e);
        }
      },
       async readConfig(params,onSuccess?, onError?) {
        try {
          localStorage.getItem("lark_config")
          // Api.getInstance()
          //   .readConfigLark(params)
          //   .then((res:any) => {
          //     if (res.status == 200 || res.status == 201) {
          //       set(() => ({
          //         lark_config: res.data.data,
          //       }));
          //       onSuccess && onSuccess(res.data.message);
          //     } else {
          //       onError && onError(res.data.message);
          //     }
          //   });
        } catch (e) {
          console.log(e);
        }
      },
      async updateConfig(params, onSuccess?, onError?) {
        try {
          Api.getInstance()
            .updateConfigLark(params)
            .then((res:any) => {
              if (res.status == 200 || res.status == 201) {
                set(() => ({
                  lark_config: res.data.data
                }));
                onSuccess && onSuccess(res.data.message);
              } else {
                onError && onError(res.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async deleteConfig(params, onSuccess?, onError?) {
        try {
          Api.getInstance()
            .deleteConfigLark(params)
            .then((res:any) => {
              if (res.status == 200 || res.status == 201) {
                set(() => ({lark_config: {}}))
                onSuccess && onSuccess(res.data.message);
              } else {
                onError && onError(res.data.message);
              }              
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "lark",
    }
  )
);

export default useLark;
