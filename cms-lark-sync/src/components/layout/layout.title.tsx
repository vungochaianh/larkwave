"use client";
import { Divider } from "antd";
import React, { ReactNode } from "react";


interface LayoutProps {
  title?:ReactNode;
  subTitle?:ReactNode;
  action?:ReactNode;
}
const LayoutTitle:React.FC<React.PropsWithChildren<LayoutProps>> = ({ children, title,subTitle,action }) => {
  return (
    <div className="flex flex-col p-4">
      <div className="flex justify-between">
      <div className="flex flex-col">
        <h1 className="font-semibold text-2xl text-[var(--primary-color)]">{title}</h1>
      {subTitle}
      </div>
{action}
      </div>
      <Divider/>
          {children}
    </div>
  );
};

export default LayoutTitle;
