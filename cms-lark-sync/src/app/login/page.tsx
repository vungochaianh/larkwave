"use client";
import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  message,
  Space,
  Spin,
} from "antd";
import { useRouter } from "next/navigation";

import Link from "next/link";
import useStaff from "@/store/staff";
import Image from "next/image";
import { Api } from "@/api/main";

function AdminLogin() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const { staff } = useStaff();
  const api = Api.getInstance();
  useEffect(() => {
    if (staff.token && staff.token != "") {
      api.setToken(staff.token);
      router.push("/user");
    }
  }, [api, router, staff.token]);
  const [form] = Form.useForm();
  const onFinish = async (values: any) => {
    await useStaff.getState().login(
      {
        email: values.email,
        password: values.password,
      },
      (e: any) => (
        staff.token && api.setToken(staff.token),
        staff.token && router.push("/user"),
        messageApi.success(e)
      ),
      (e: any) => messageApi.error(e)
    );
  };

  const onFinishFailed = (errorInfo: any) => {
    console.log("Failed:", errorInfo);
  };

  return (
    <div className="w-full h-[100vh] flex justify-center items-center flex-col gap-10">
      {contextHolder}
      <Card className="shadow-xl w-[500px] max-[500px]:w-10/12 ">
        <Link
          className="flex gap-2 justify-center items-center hover:scale-105 ease duration-100"
          href="/"
        >
          <Image src="/logo.png" alt="" width={50} height={50} />
          <h2 className="font-bold text-[var(--primary-color)]">Đăng nhập</h2>
        </Link>
        <Form
          name="basic"
          layout="vertical"
          form={form}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
        >
          <Form.Item
            label="Số điện thoại/Email"
            name="email"
            rules={[
              { required: true, message: "Số điện thoại/Email là bắt buộc" },
            ]}
          >
            <Input className="w-full" />
          </Form.Item>

          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[{ required: true, message: "Mật khẩu là bắt buộc" }]}
          >
            <Input.Password className="w-full" />
          </Form.Item>
          <Form.Item className="w-full">
            <Button type="primary" htmlType="submit" className="w-full">
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default AdminLogin;
