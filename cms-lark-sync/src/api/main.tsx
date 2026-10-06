import { ApiConfig } from "./config";

export class Api extends ApiConfig {
  private static instance: Api;

  private constructor() {
    super();
  }

  static getInstance(): Api {
    if (!Api.instance) {
      Api.instance = new Api();
    }
    return Api.instance;
  }

  loginPartner = (params: any) => this.api.post("/login/partner", params);
  createPartner = (params: any) => this.api.post("/create/partner", params);
  getPartners = (params: any) => this.api.post("/partners", params);
  updatePartner = (params: any) => this.api.put("/partner", params);
  async deletePartner(params: any) {
    return this.api.delete(
      "/partner",
      {},
      {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(params),
      }
    );
  }

  // package
  createPackage = (params: any) => this.api.post("/package/create", params);
  multipleListPackage = (params:any) => this.api.post("/packages/list", params);
  updatePackage = (params: any) => this.api.put("/package/update", params);
  async deletePackage(params: any) {
    const response = await this.api.delete(
      "/package/delete",
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify(params),
      }
    );
    return response;
  }

  // package user
  createPackageUser = (params: any) => this.api.post("/package/user/create", params);
  async deletePackagesUser(params: any) {
    const response = await this.api.delete(
      "/packages/user",
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify(params),
      }
    );
    return response;
  }
  multipleListPackageUser = (params: any) => this.api.post("/package/users/list", params);

  // staff
  loginStaff = (params: any) => this.api.post("/staff/login", params);
  createStaff = (params: any) => this.api.post("/staff/create", params);
  multipleListStaff = (params: any) => this.api.post("/staffs/list", params);
  updateStaff = (params: any) => this.api.put("/staff/update", params);
  deleteStaff = async (params: any) => {
    const response = await this.api.delete(
      "/staff/delete",
      {},
      {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(params),
      }
    );
    return response;
  };

  // user
  createUser = (params: any) => this.api.post("/user/create", params);
  multipleListUser = (params: any) => this.api.post("/users/list", params);
  updateUser = (params: any) => this.api.put("/user/update", params);
  deleteUser = async (params: any) => {
    const response = await this.api.delete(
      "/user/delete",
      {},
      {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(params),
      }
    );
    return response;
  };

  // lark
  createConfigLark = (params:any) => this.api.post("/lark/create-config", params);
  readConfigLark = (params:any) => this.api.get("/lark/read-config", params);
  updateConfigLark = (params:any) => this.api.put("/lark/update-config", params);
  deleteConfigLark = (params:any) => this.api.post("/lark/delete-config", params);

}
