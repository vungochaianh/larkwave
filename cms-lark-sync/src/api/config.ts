import { create, ApisauceInstance } from "apisauce";

export function getBaseURL(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost") {
      return "http://localhost:3000/";
    }
  }

  return "https://apihoanam.toolswave.net/";
}

interface ApiConfigOptions {
  token?: string;
  customHeaders?: Record<string, string>;
}

export class ApiConfig {
  protected api: ApisauceInstance;

  constructor(options?: ApiConfigOptions) {
    this.api = create({
      baseURL: getBaseURL(),
      headers: {
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options?.customHeaders || {})
      }
    });
  }

  // Cho phép thay đổi token (ví dụ sau khi đăng nhập)
  public setToken(token: string) {
    this.api.setHeader("Authorization", `Bearer ${token}`);
  }

  public setHeader(name: string, value: string) {
    this.api.setHeader(name, value);
  }

  public getApi(): ApisauceInstance {
    return this.api;
  }
}
