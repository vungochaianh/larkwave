import { Api } from "@/api/main";
import { message } from "antd";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StaffState {
  staff: any;
  staffs: any[];
  create: (params: any, onSuccess: Function) => void;
  multipleList: (params: any) => void;
  update: (params: any, onSuccess: Function) => void;
  delete: (params: any, onSuccess: Function) => void;
  login: (params: any, onSuccess: Function, onError?: Function) => void;
}

const initialState = {
  staff: {},
  staffs: [],
};

const useStaff = create<StaffState>()(
  persist(
    (set) => ({
      ...initialState,
      async login(params, onSuccess, onError?) {
        try {
          // @ts-ignore
          Api.getInstance()
            .loginStaff(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                set((state) => ({
                  // @ts-ignore
                  staff: res.data.data,
                }));
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
      async create(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .createStaff(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                onSuccess();
              } else {
                // @ts-ignore
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async multipleList(params) {
        try {
          // @ts-ignore
          Api.getInstance()
            .multipleListStaff(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                set((state) => ({
                  // @ts-ignore
                  staffs: res.data.data,
                }));
                // @ts-ignore
              } else {
                set((state) => ({
                  staffs: [],
                }));
                // @ts-ignore
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async update(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .updateStaff(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                onSuccess();
              } else {

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
            .deleteStaff(params)
            .then((res) => {
              // @ts-ignore
              if (res.status == 200 || res.status == 201) {
                // @ts-ignore
                message.success(res.data.message);
                onSuccess();
              } else {
                // @ts-ignore
                message.info(res.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "staff",
    }
  )
);

export default useStaff;
