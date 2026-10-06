import { Api } from "@/api/main";
import { message } from "antd";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PartnerState {
  partner: any;
  partners: any[];
  createPartner: (params: any, onSuccess: Function) => void;
  getPartners: (params: any) => void;
  updatePartner: (params: any, onSuccess: Function) => void;
  deletePartner: (params: any, onSuccess: Function) => void;
  loginPartner: (params: any, onSuccess: Function) => void;
}

const initialState = {
  partner: {},
  partners: [],
};

const usePartner = create<PartnerState>()(
  persist(
    (set) => ({
      ...initialState,
      async loginPartner(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .loginPartner(params)
            .then((response) => {
              // @ts-ignore
              if (response.data && response.data.data) {
                set((state) => ({
                  // @ts-ignore
                  partner: response.data.data,
                }));
                // @ts-ignore
                message.success(response.data.message);
                onSuccess();
              } else {
                set((state) => ({}));
                // @ts-ignore
                message.info(response.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async createPartner(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .createPartner(params)
            .then((response) => {
              // @ts-ignore
              if (response.data && response.data.data) {
                // @ts-ignore
                onSuccess();
              } else {
                // @ts-ignore
                message.info(response.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async getPartners(params) {
        try {
          // @ts-ignore
          Api.getInstance()
            .getPartners(params)
            .then((response) => {
              // @ts-ignore
              if (response.data && response.data.data) {
                set((state) => ({
                  // @ts-ignore
                  partners: response.data.data,
                }));
                // @ts-ignore
              } else {
                set((state) => ({
                  partners: [],
                }));
                // @ts-ignore
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async updatePartner(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .updatePartner(params)
            .then((response) => {
              // @ts-ignore
              if (response.data && response.data.data) {
                set((state) => ({
                  // @ts-ignore
                  partner: response.data.data,
                }));
                // @ts-ignore
                message.success(response.data.message);
                onSuccess();
              } else {
                set((state) => ({}));
                // @ts-ignore
                message.info(response.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
      async deletePartner(params, onSuccess) {
        try {
          // @ts-ignore
          Api.getInstance()
            .deletePartner(params)
            .then((response) => {
              // @ts-ignore
              if (response.data && response.data.data) {
                // @ts-ignore
                message.success(response.data.message);
                onSuccess();
              } else {
                // @ts-ignore
                message.info(response.data.message);
              }
            });
        } catch (e) {
          console.log(e);
        }
      },
    }),
    {
      name: "partner",
    }
  )
);

export default usePartner;
