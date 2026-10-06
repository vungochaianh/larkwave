import {
  EditFilled,
  PlayCircleOutlined,
  PlusCircleFilled,
} from "@ant-design/icons";
import { Label, ModalCustom } from "../custome";
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Space,
} from "antd";
import Password from "antd/es/input/Password";
import useUser from "@/store/user";
import Image from "next/image";
import useStaff from "@/store/staff";
import { useEffect } from "react";
import usePackage from "@/store/package";
import Utils from "@/function/utils";
import usePackageUser from "@/store/packageUser";

interface FormUserProps {
  typeForm?:
    | "create"
    | "update"
    | "delete"
    | "register_user"
    | "reset_password";
  record?: any;
  callBack?: (value: boolean) => void;
  [key: string]: any;
}

const FormUser: React.FC<FormUserProps> = ({
  typeForm,
  record,
  callBack,
  ...props
}: FormUserProps) => {
  const { staff } = useStaff();
  const { packages } = usePackage();
  const u = new Utils();
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  // useEffect(() => {
  //   usePackage.getState().getPackages();
  // }, []);
  const textButton =
    typeForm == "create"
      ? "Thêm"
      : typeForm == "update"
      ? "Cập nhật"
      : typeForm == "reset_password"
      ? "Reset mật khẩu"
      : typeForm == "delete"
      ? "Xóa"
      : typeForm == "register_user"
      ? "Mua gói"
      : "Null";
  const apis = {
    create: useUser.getState().create,
    update: useUser.getState().update,
    delete: useUser.getState().delete,
    register_user: usePackageUser.getState().create,
    reset_password: useUser.getState().update,
  };
  const buildPayload = {
    create: (values: any) => ({
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      other_invite: values.other_invite,
      role: values.role,
      staff_id: staff.id,
    }),
    update: (values: any) => ({
      id: record.id,
      staff_id: staff.id,
      full_name: values.full_name,
      status: values.status,
      email: values.email,
      role: values.role,
      reset_password: values.reset_password
    }),
    reset_password: (values: any) => ({
      id: record.id,
      reset_password: true,
    }),
    delete: (values: any) => ({
      id: record.id,
      staff_id: staff.id,
    }),
    register_user: (values: any) => ({
      package_id: values.package_id,
      staff_id: staff.id,
      user_id: record.id,
    }),
  };

  const initialValues: Record<string, any> = {
    ...record,
  };

  const onFinish = async () => {
    const values = await form.getFieldsValue();
    const api = apis[typeForm as keyof typeof apis];
    const build = buildPayload[typeForm as keyof typeof buildPayload];

    if (!api || !build) return console.error("Invalid typeForm:", typeForm);
    const params = build(values);
    api(
      params,
      (e: any) => {
        messageApi.success(e);
        callBack && callBack(true);
      },
      (e: any) => {
        messageApi.error(e);
        callBack && callBack(false);
      }
    );
  };

  return (
    <>
      {contextHolder}
      {typeForm == "register_user" ? (
        <ModalCustom
          title={`${textButton} người dùng`}
          widthModal={391}
          contentModal={(handleCancel) => (
            <Form
              name="basic"
              layout="vertical"
              onFinish={onFinish}
              form={form}
              initialValues={initialValues}
            >
              <Form.Item
                label="Gói cước"
                name="package_id"
                id="package_id"
                rules={[{ required: true, message: "Họ tên là bắt buộc!" }]}
              >
                <Select>
                  {packages?.map((i) => (
                    <Select.Option value={i.id}>{i.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <div className="flex gap-4">
                <Form.Item className="w-full">
                  <Button
                    type="primary"
                    htmlType="submit"
                    className="w-full"
                    onClick={handleCancel}
                  >
                    Lưu người dùng
                  </Button>
                </Form.Item>
              </div>
            </Form>
          )}
          button={<PlayCircleOutlined className="cursor-pointer" />}
        />
      ) : typeForm == "delete" ? (
        <ModalCustom
          closeIcon={false}
          widthModal={391}
          contentModal={(handleCancel) => (
            <div className="flex flex-col justify-center items-center gap-3 text-[#0C092A]">
              <Image
                src={"/svg/trash-circle.svg"}
                alt="#"
                width={64}
                height={64}
              />
              <h3 className="font-bold ">Ngưng hoạt động</h3>
              <span className="text-base text-center font-normal">
                Ngưng hoạt động người dùng, tài khoản người dùng sẽ không thể
                đăng nhập lại cho đến khi mở lại. Bạn có chắc với lựa chọn của
                mình?
              </span>
              <Space size={"small"} className="mt-5">
                <Button type="text" onClick={handleCancel}>
                  Hủy
                </Button>
                <Button danger type="primary" onClick={onFinish}>
                  Xác nhận
                </Button>
              </Space>
            </div>
          )}
          button={
            <Label
              SVGSource="action/trash.svg"
              danger
              className="cursor-pointer"
            />
          }
        />
      ) : (
        <ModalCustom
          title={`${textButton} người dùng`}
          styleButton="cursor-pointer"
          isButton={typeForm == "create"}
          button={
            <>
              {typeForm == "create" ? <><PlusCircleFilled /> {textButton}</>: <EditFilled />}{" "}
            </>
          }
          contentModal={(handleCancel) => (
            <Form
              name="basic"
              layout="vertical"
              onFinish={onFinish}
              form={form}
              initialValues={initialValues}
            >
              <Form.Item
                label="Họ tên"
                name="full_name"
                id="full_name"
                rules={[{ required: true, message: "Họ tên là bắt buộc!" }]}
              >
                <Input className="w-full" />
              </Form.Item>

              <Form.Item
                label="Số điện thoại/email"
                name="email"
                id="email"
                rules={[
                  {
                    required: true,
                    message: "Số điện thoại/Email là bắt buộc!",
                  },
                ]}
              >
                <Input />
              </Form.Item>
               {typeForm == "update" &&
              <Form.Item
                label="Trạng thái tài khoản"
                name="status"
                id="status"
              >
                <Radio.Group>
    <Radio value={1}>Hoạt động</Radio>
    <Radio value={0}>Ngưng hoạt động</Radio>
  </Radio.Group>
              </Form.Item>
               }
               {typeForm == "update" &&
              <Form.Item
              id="reset_password"
                label="Reset mật khẩu về '12345' "
                name="reset_password"
                valuePropName="checked" 
              >
                <Checkbox>Đồng ý</Checkbox>
              </Form.Item>
               }
              {typeForm == "create" && (
                <Form.Item
                  label="Mật khẩu"
                  name="password"
                  id="password"
                  rules={[{ required: true, message: "Mật khẩu là bắt buộc!" }]}
                >
                  <Password />
                </Form.Item>
              )}

              <div className="flex gap-4">
                <Form.Item className="w-full">
                  <Button
                    type="primary"
                    htmlType="submit"
                    className="w-full"
                    onClick={handleCancel}
                  >
                    Lưu người dùng
                  </Button>
                </Form.Item>
              </div>
            </Form>
          )}
        />
      )}
    </>
  );
};

export default FormUser;
