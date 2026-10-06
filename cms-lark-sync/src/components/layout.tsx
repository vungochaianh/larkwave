"use client";
import React, { useEffect } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "../app/globals.css";
import { ConfigProvider } from "antd";
import { lightTheme, darkTheme } from "@/theme/themeConfig";
import useTheme from "@/store/theme";

const RootLayout = ({ children }: React.PropsWithChildren) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <html lang="en">
      <head>
        <title>lark.</title>
        <link rel="shortcut icon" href="/logo.png" type="image/x-icon" />
      </head>
      <body>
        <ConfigProvider theme={isDark ? darkTheme : lightTheme}>
          <AntdRegistry>{children}</AntdRegistry>
        </ConfigProvider>
      </body>
    </html>
  );
};

export default RootLayout;
